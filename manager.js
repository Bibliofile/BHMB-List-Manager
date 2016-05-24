'use strict';

/*jshint
    esversion: 6,
    undef: true,
    unused: true,
    browser: true,
    devel: true
*/
/*global
    MessageBotExtension
*/

var biblio_lists = MessageBotExtension('biblio_lists');

(function () {
    var _this = this;

    //Start with empty lists
    this.lists = {
        admins: '',
        modlist: '',
        whitelist: '',
        blacklist: ''
    };
    this.worlds = [];

    //Functions
    {
        this.getStatus = function (ids) {
            return Promise.all(ids.map(function (id) {
                return _this.core.ajax.postJSON('http://portal.theblockheads.net/api', { command: 'status', worldId: id });
            }));
        };

        this.ensureOnline = function (id) {
            _this.core.ajax.postJSON('/api', { command: 'start', worldId: id });

            return new Promise(function (resolve, reject) {
                var tries = 0;
                (function waitForStart(ext) {
                    ext.core.ajax.postJSON('/api', { command: 'status', worldId: id }).then(function (world) {
                        if (world.worldStatus == 'online') {
                            return resolve();
                        } else {
                            if (tries++ < 12) {
                                setTimeout(waitForStart, 5000, ext);
                            } else {
                                return reject();
                            }
                        }
                    });
                })(_this);
            });
        };

        this.unique = function (arr) {
            var seen = new Set();
            return arr.filter(function (item) {
                if (!seen.has(item.toLocaleUpperCase())) {
                    seen.add(item.toLocaleUpperCase());
                    return true;
                }
            });
        };

        //Steps
        this.stepOne = function (e) {
            var page = e.target.parentElement;

            _this.core.ajax.get('/worlds').then(function (resp) {
                var doc = new DOMParser().parseFromString(resp, 'text/html');
                _this.worlds = [];

                doc.body.querySelector('script').textContent.split('\n').forEach(function (line) {
                    if (line.startsWith('\t\t\tupdateWorld')) {
                        var needed = line.substring(15, line.length - 1).replace(/(['"])?(\w+)(['"])?: (')?(.*?)(')?([,}])/gi, '"$2": "$5"$7');

                        _this.worlds.push(JSON.parse(needed));
                    }
                });

                return _this.worlds;
            }).then(function (worlds) {
                void 0;

                page.innerHTML = worlds.reduce(function (html, world) {
                    return html + '<label><input type="checkbox" value="' + world.id + '"/>' + _this.bot.stripHTML(world.name) + ' (' + world.worldStatus + ')</label><br>';
                }, '<h3>Step 1: Choose the worlds you want to combine lists from.</h3><div class="worlds">') + '</div>\n                    <hr>Settings:<br>\n                    <div class="settings">\n                        <label><input type="checkbox" name="alphabeta"/>Sort created list alphabetically</label><br>\n                        <label><input type="checkbox" name="duplicates" checked/>Remove duplicates (case insensitive)</label><br>\n                    </div><br>\n                    <a class="button">Continue</a>';

                page.querySelector('a').addEventListener('click', _this.stepTwo);
            });
        };

        this.stepTwo = function (e) {
            var page = e.target.parentElement;
            var listname = page.id.replace('mb_' + _this.id + '_', '');
            var settings = {
                sort: page.querySelector('[name="alphabeta"]').checked,
                remove_duplicates: page.querySelector('[name="duplicates"]').checked
            };

            var ids = Array.from(page.querySelectorAll('.worlds input')).reduce(function (ids, input) {
                if (input.checked) {
                    ids.push(input.value);
                }
                return ids;
            }, []);

            if (ids.length < 2) {
                _this.ui.notify('Please select at least two worlds.');
                return;
            }

            page.innerHTML = 'Starting worlds...';
            void 0;

            Promise.all(ids.map(function (id) {
                return _this.core.ajax.postJSON('/api', { command: 'start', worldId: id });
            })).then(function () {
                return new Promise(function (resolve, reject) {
                    var tries = 0;
                    (function waitForWorlds(ext) {
                        ext.getStatus(ids).then(function (worlds) {
                            if (worlds.every(function (world) {
                                return world.worldStatus == 'online';
                            })) {
                                return resolve();
                            } else {
                                if (tries++ < 12) {
                                    page.innerHTML = worlds.reduce(function (html, world) {
                                        return html + '<span>' + ext.bot.stripHTML(world.name) + ' (' + world.worldStatus.replace('startup', 'starting') + ')</span><br>';
                                    }, '<span>Starting worlds...</span><br>');
                                    setTimeout(waitForWorlds, 5000, ext);
                                } else {
                                    page.innerHTML = '<span style="color:#f00;">Unable to start all worlds in time.</span>';
                                    return reject();
                                }
                            }
                        });
                    })(_this);
                });
            }).then(function () {
                page.innerHTML = 'All worlds online! Fetching lists...';
                void 0;

                return Promise.all(ids.map(function (id) {
                    return _this.core.ajax.get('/worlds/lists/' + id).then(function (resp) {
                        var doc = new DOMParser().parseFromString(resp, 'text/html');
                        var name = listname == 'adminlist' ? 'admins' : listname;
                        return doc.querySelector('[name="' + name + '"]').value.split('\n');
                    });
                }));
            }).then(function (lists) {
                void 0;

                var superlist = [];
                lists.forEach(function (list) {
                    superlist = superlist.concat(list);
                });

                if (settings.sort) {
                    superlist.sort(function (a, b) {
                        return a.toLowerCase().localeCompare(b.toLowerCase());
                    });
                }
                if (settings.remove_duplicates) {
                    superlist = _this.unique(superlist);
                }

                page.innerHTML = '<h3>Step 2: Edit this list as desired.</h3><textarea style="width:100%;height:60vh;">' + _this.bot.stripHTML(superlist.join('\n')) + '</textarea><a class="button">Continue</a>';

                page.querySelector('a').addEventListener('click', _this.stepThree);
            });
        };

        this.stepThree = function (e) {
            void 0;

            var page = e.target.parentElement;
            var listname = page.id.replace('mb_' + _this.id + '_', '').replace('adminlist', 'admins');
            _this.lists[listname] = page.querySelector('textarea').value;

            page.innerHTML = _this.worlds.reduce(function (html, world) {
                return html + '<label><input type="checkbox" value="' + world.id + '"/>' + _this.bot.stripHTML(world.name) + '</label><br>';
            }, '<h3>Step 3: Choose which worlds to push this list to.</h3><div class="worlds">') + '</div>\n            <hr>Mode:<br><div class="mode">\n                <label><input type="radio" name="mode" value="overwrite" checked/>Overwrite</label><br>\n                <label><input type="radio" name="mode" value="append"/>Append</label><br>\n            </div><a class="button">Update lists</a>';

            page.querySelector('a').addEventListener('click', _this.stepFour);
        };

        this.stepFour = function (e) {
            void 0;

            var page = e.target.parentElement;
            var listname = page.id.replace('mb_' + _this.id + '_', '').replace('adminlist', 'admins');
            var mode = Array.from(page.querySelectorAll('[type="radio"]')).reduce(function (p, c) {
                return c.checked ? c.value : p;
            }, '');

            var ids = Array.from(page.querySelectorAll('.worlds input')).reduce(function (ids, input) {
                if (input.checked) {
                    ids.push(input.value);
                }
                return ids;
            }, []);

            page.innerHTML = 'Saving lists...<br>';

            var setCounter = 0;
            ids.forEach(function (id) {
                _this.ensureOnline(id).then(function () {
                    return _this.core.ajax.get('/worlds/lists/' + id);
                }).then(function (resp) {
                    var doc = new DOMParser().parseFromString(resp, 'text/html');
                    var lists = {
                        admins: doc.querySelector('[name="admins"]').value,
                        modlist: doc.querySelector('[name="modlist"]').value,
                        whitelist: doc.querySelector('[name="whitelist"]').value,
                        blacklist: doc.querySelector('[name="blacklist"]').value
                    };

                    switch (mode) {
                        case 'overwrite':
                            lists[listname] = _this.lists[listname];
                            break;
                        case 'append':
                            lists[listname] = lists[listname] + '\n' + _this.lists[listname];
                            break;
                    }

                    return _this.core.ajax.postJSON('/worlds/lists/' + id, lists);
                }).then(function (data) {
                    if (data.status == 'ok') {
                        return _this.getStatus([id]).then(function (worlds) {
                            page.innerHTML += 'Updated ' + _this.bot.stripHTML(worlds[0].name) + '\'s lists.<br>';
                        });
                    } else {
                        return _this.getStatus([id]).then(function (worlds) {
                            page.innerHTML += 'Error updating ' + _this.bot.stripHTML(worlds[0].name) + '\'s lists.<br>';
                        });
                    }
                }).then(function () {
                    setCounter++;
                    if (setCounter == ids.length) {
                        page.innerHTML += '<a class="button">Select new lists</a>';
                        page.querySelector('a').addEventListener('click', _this.stepOne);
                    }
                });
            });
        };
    }

    this.setAutoLaunch(true);

    //Setup...
    this.addTabGroup('LISTS', 'lists');
    this.addTab('Adminlist', 'adminlist', 'biblio_lists_lists');
    this.addTab('Modlist', 'modlist', 'biblio_lists_lists');
    this.addTab('Whitelist', 'whitelist', 'biblio_lists_lists');
    this.addTab('Blacklist', 'blacklist', 'biblio_lists_lists');

    ['adminlist', 'modlist', 'whitelist', 'blacklist'].forEach(function (list) {
        var page = document.querySelector('#mb_' + _this.id + '_' + list);
        page.innerHTML = 'Loading...';
        _this.stepOne({ target: { parentElement: page } });
    });
}).bind(biblio_lists)();