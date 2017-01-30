'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

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

(function (ex, ui, api) {
    ex.setAutoLaunch(true);
    ex.uninstall = function () {
        //Remove all our tabs
        ui.removeTabGroup('biblio_lists');
    };

    ui.addTabGroup('Lists', 'biblio_lists');
    var tab = {
        admin: ui.addTab('Adminlist', 'biblio_lists'),
        mod: ui.addTab('Modlist', 'biblio_lists'),
        white: ui.addTab('Whitelist', 'biblio_lists'),
        black: ui.addTab('Blacklist', 'biblio_lists')
    };
    Object.keys(tab).forEach(function (key) {
        tab[key].dataset.listName = key;
    });

    //Used to save lists between steps
    ex.lists = {
        admin: '',
        mod: '',
        white: '',
        black: ''
    };

    function setTabHTML(name, html) {
        name = name.toLocaleLowerCase();

        if (name == 'all') {
            Object.keys(tab).forEach(function (key) {
                tab[key].innerHTML = html;
            });
        } else {
            tab[name].innerHTML = html;
        }
    }

    function setTabListener(name, selector, type, listener) {
        name = name.toLocaleLowerCase();

        if (name == 'all') {
            Object.keys(tab).forEach(function (key) {
                tab[key].querySelector(selector).addEventListener(type, listener);
            });
        } else {
            tab[name].querySelector(selector).addEventListener(type, listener);
        }
    }

    function unique(arr) {
        var seen = new Set();
        return arr.filter(function (item) {
            if (!seen.has(item.toLocaleUpperCase())) {
                seen.add(item.toLocaleUpperCase());
                return true;
            }
        });
    }

    function stripHTML(html) {
        return html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
    }

    //Let the user know we are waiting.
    setTabHTML('all', 'Loading...');
    showWorlds('all');

    //Load the worlds
    function showWorlds(tabName) {
        api.getWorlds().then(function (worlds) {
            void 0;

            var html = worlds.reduce(function (html, world) {
                return html + '<label><input type="checkbox" class="checkbox" value="' + world.id + '"/>' + stripHTML(world.name) + ' (' + world.worldStatus + ')</label><br>';
            }, '<h3 class="title">Step 1: Choose the worlds you want to combine lists from.</h3><div class="worlds">');
            html += '</div>\n                <hr>Settings:<br>\n                <div class="settings">\n                    <label><input type="checkbox" class="checkbox" name="alphabeta"/>Sort created list alphabetically</label><br>\n                    <label><input type="checkbox" class="checkbox" name="duplicates" checked/>Remove duplicates (case insensitive)</label><br>\n                </div><br>\n                <a class="button">Continue</a>';

            setTabHTML(tabName, html);
            setTabListener(tabName, 'a', 'click', getWorldLists);
        });
    }

    function getWorldLists(event) {
        var content = event.target.parentElement;
        var listName = content.dataset.listName;
        var settings = {
            sort: content.querySelector('[name="alphabeta"]').checked,
            remove_duplicates: content.querySelector('[name="duplicates"]').checked
        };

        var ids = Array.from(content.querySelectorAll('.worlds input:checked')).reduce(function (ids, input) {
            ids.push(input.value);
            return ids;
        }, []);

        if (ids.length < 2) {
            ex.ui.notify('Please select at least two worlds.');
            return;
        }

        content.innerHTML = 'Starting worlds and getting lists...';

        Promise.all(ids.map(function (id) {
            return api.getLists(id);
        })).then(function (lists) {
            return lists.reduce(function (superlist, worldLists) {
                return superlist.concat(worldLists[listName]);
            }, []);
        }).then(function (superlist) {
            if (settings.sort) {
                superlist.sort(function (a, b) {
                    return a.toLowerCase().localeCompare(b.toLowerCase());
                });
            }
            if (settings.remove_duplicates) {
                superlist = unique(superlist);
            }
            return superlist;
        }).then(function (superlist) {
            content.innerHTML = '<h3 class="title">Step 2: Edit this list as desired.</h3><textarea style="width:100%;height:60vh;">' + stripHTML(superlist.join('\n')) + '</textarea><a class="button">Continue</a>';

            content.querySelector('a').addEventListener('click', choosePushWorlds);
        });
    }

    function choosePushWorlds(event) {
        var content = event.target.parentElement;
        var listName = content.dataset.listName;

        ex.lists[listName] = content.querySelector('textarea').value;

        api.getWorlds().then(function (worlds) {
            content.innerHTML = worlds.reduce(function (html, world) {
                return html + '<label><input type="checkbox" class="checkbox" value="' + world.id + '"/>' + stripHTML(world.name) + '</label><br>';
            }, '<h3 class="title">Step 3: Choose which worlds to push this list to.</h3><div class="worlds">') + '</div>\n            <hr>Mode:<br><div class="mode">\n                <label><input class="radio" type="radio" name="mode" value="overwrite" checked/>Overwrite</label><br>\n                <label><input class="radio" type="radio" name="mode" value="append"/>Append</label><br>\n            </div><a class="button">Update lists</a>';

            content.querySelector('a').addEventListener('click', saveLists);
        });
    }

    function saveLists(event) {
        var content = event.target.parentElement;
        var listName = content.dataset.listName;

        var mode = content.querySelector('[type=radio]:checked').value;

        var ids = Array.from(content.querySelectorAll('.worlds input:checked')).reduce(function (ids, input) {
            ids.push(input.value);
            return ids;
        }, []);

        content.innerHTML = 'Saving lists...<br>';

        Promise.all(ids.map(function (id) {
            return api.getLists(id).then(function (lists) {
                void 0;
                var sendLists = {
                    admins: lists.admin.join('\n'),
                    modlist: lists.mod.join('\n'),
                    whitelist: lists.white.join('\n'),
                    blacklist: lists.black.join('\n')
                };

                var translatedListName;
                switch (listName) {
                    case 'admin':
                        translatedListName = 'admins';
                        break;
                    case 'mod':
                        translatedListName = 'modlist';
                        break;
                    case 'black':
                        translatedListName = 'blacklist';
                        break;
                    case 'white':
                        translatedListName = 'whitelist';
                }

                switch (mode) {
                    case 'overwrite':
                        sendLists[translatedListName] = ex.lists[listName];
                        break;
                    case 'append':
                        sendLists[translatedListName] += '\n' + ex.lists[listName];
                        break;
                }

                return ex.ajax.postJSON('/worlds/lists/' + lists.id, sendLists).then(function (result) {
                    return [result, lists.id];
                });
            }).then(function (data) {
                var _data = _slicedToArray(data, 2);

                var response = _data[0];
                var id = _data[1];

                void 0;
                var result = response.status == 'ok' ? 'Success' : 'Failed';
                return api.getWorlds().then(function (worlds) {
                    worlds.forEach(function (world) {
                        if (id == world.id) {
                            content.innerHTML += stripHTML(world.name) + ': ' + result + '<br>';
                        }
                    });
                });
            });
        })).then(function () {
            //All done!
            content.innerHTML += '<a class="button">Select new lists</a>';
            content.querySelector('a').addEventListener('click', function () {
                return showWorlds(listName);
            });
        });
    }
})(biblio_lists, biblio_lists.ui, function (ajax) {
    //Api
    var cache = {};

    var api = {};

    api.ensureOnline = function (id) {
        ajax.postJSON('/api', { command: 'start', worldId: id });

        return new Promise(function (resolve, reject) {
            var tries = 0;
            (function waitForStart() {
                ajax.postJSON('/api', { command: 'status', worldId: id }).then(function (world) {
                    if (world.worldStatus == 'online') {
                        return resolve();
                    } else {
                        if (tries++ < 12) {
                            setTimeout(waitForStart, 5000);
                        } else {
                            return reject();
                        }
                    }
                });
            })();
        });
    };

    api.getStatus = function (id) {
        return ajax.postJSON('/api', { command: 'status', worldId: id });
    };

    api.getLists = function (id) {
        return api.ensureOnline(id).then(function () {
            return ajax.get('/worlds/lists/' + id);
        }).then(function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');

            function getList(name) {
                var list = doc.querySelector('textarea[name=' + name + ']').value.toLocaleUpperCase().split('\n');
                return [].concat(_toConsumableArray(new Set(list))); //Remove duplicates
            }

            var admin = getList('admins');
            var mod = getList('modlist');
            mod = mod.filter(function (name) {
                return admin.indexOf(name) < 0;
            });
            var staff = admin.concat(mod);

            var white = getList('whitelist');
            var black = getList('blacklist');

            return { admin: admin, mod: mod, staff: staff, white: white, black: black, id: id };
        });
    };

    api.getWorlds = function () {
        if (cache.getWorlds) {
            return cache.getWorlds;
        }

        cache.getWorlds = ajax.get('/worlds').then(function (resp) {
            var doc = new DOMParser().parseFromString(resp, 'text/html');
            var worlds = [];

            doc.body.querySelector('script').textContent.split('\n').forEach(function (line) {
                if (line.startsWith('\t\t\tupdateWorld')) {
                    var needed = line.substring(15, line.length - 1).replace(/(['"])?(\w+)(['"])?: (')?(.*?)(')?([,}])/gi, '"$2": "$5"$7');

                    worlds.push(JSON.parse(needed));
                }
            });

            return worlds;
        });

        return cache.getWorlds;
    };

    return api;
}(biblio_lists.ajax));