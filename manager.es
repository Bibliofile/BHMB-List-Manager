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

let biblio_lists = MessageBotExtension('biblio_lists');

(function() {
    //Start with empty lists
    this.lists = {
        admins: '',
        modlist: '',
        whitelist: '',
        blacklist: '',
    };
    this.worlds = [];

    //Functions
    {
        this.getStatus = (ids) => {
            return Promise.all(
                ids.map((id) => {
                    return this.core.ajax.postJSON('http://portal.theblockheads.net/api', {command: 'status', worldId: id});
                })
            );
        };

        this.ensureOnline = (id) => {
            this.core.ajax.postJSON('/api', {command: 'start', worldId: id});

            return new Promise((resolve, reject) => {
                let tries = 0;
                (function waitForStart(ext) {
                    ext.core.ajax.postJSON('/api', {command: 'status', worldId: id}).then((world) => {
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
                }(this));
            });
        };

        this.unique = (arr) => {
            let seen = new Set();
            return arr.filter((item) => {
                if (!seen.has(item.toLocaleUpperCase())) {
                    seen.add(item.toLocaleUpperCase());
                    return true;
                }
            });
        };

        //Steps
        this.stepOne = (e) => {
            let page = e.target.parentElement;

            this.core.ajax.get('/worlds').then((resp) => {
                let doc = (new DOMParser()).parseFromString(resp, 'text/html');
                this.worlds = [];

                doc.body.querySelector('script').textContent.split('\n').forEach((line) => {
                    if (line.startsWith('\t\t\tupdateWorld')) {
        				let needed = line
                                        .substring(15, line.length - 1)
                                        .replace(/(['"])?(\w+)(['"])?: (')?(.*?)(')?([,}])/gi, '"$2": "$5"$7');

        				this.worlds.push(JSON.parse(needed));
        			}
                });

                return this.worlds;
            })
            .then((worlds) => {
                console.log('Worlds fetched...', worlds);

                page.innerHTML = worlds.reduce((html, world) => {
                    return `${html}<label><input type="checkbox" value="${world.id}"/>${this.bot.stripHTML(world.name)} (${world.worldStatus})</label><br>`;
                }, '<h3>Step 1: Choose the worlds you want to combine lists from.</h3><div class="worlds">') +
                    `</div>
                    <hr>Settings:<br>
                    <div class="settings">
                        <label><input type="checkbox" name="alphabeta"/>Sort created list alphabetically</label><br>
                        <label><input type="checkbox" name="duplicates" checked/>Remove duplicates (case insensitive)</label><br>
                    </div><br>
                    <a class="button">Continue</a>`;

                page.querySelector('a').addEventListener('click', this.stepTwo);
            });
        };

        this.stepTwo = (e) => {
            let page = e.target.parentElement;
            let listname = page.id.replace(`mb_${this.id}_`, '');
            let settings = {
                sort: page.querySelector('[name="alphabeta"]').checked,
                remove_duplicates: page.querySelector('[name="duplicates"]').checked,
            };

            let ids = Array.from(page.querySelectorAll('.worlds input')).reduce((ids, input) => {
                if (input.checked) {
                    ids.push(input.value);
                }
                return ids;
            }, []);

            if (ids.length < 2) {
                this.ui.notify('Please select at least two worlds.');
                return;
            }

            page.innerHTML = 'Starting worlds...';
            console.log('Starting worlds...');

            Promise.all(
                ids.map((id) => this.core.ajax.postJSON('/api', {command: 'start', worldId: id}))
            )
            .then(() => {
                return new Promise((resolve, reject) => {
                    let tries = 0;
                    (function waitForWorlds(ext) {
                        ext.getStatus(ids).then((worlds) => {
                            if (worlds.every((world) => world.worldStatus == 'online')) {
                                return resolve();
                            } else {
                                if (tries++ < 12) {
                                    page.innerHTML = worlds.reduce((html, world) => {
                                        return `${html}<span>${ext.bot.stripHTML(world.name)} (${world.worldStatus.replace('startup', 'starting')})</span><br>`;
                                    }, `<span>Starting worlds...</span><br>`);
                                    setTimeout(waitForWorlds, 5000, ext);
                                } else {
                                    page.innerHTML = '<span style="color:#f00;">Unable to start all worlds in time.</span>';
                                    return reject();
                                }
                            }
                        });
                    }(this));
                });
            })
            .then(() => {
                page.innerHTML = 'All worlds online! Fetching lists...';
                console.log('All selected worlds are online. Fetching lists... ');

                return Promise.all(
                    ids.map((id) => {
                        return this.core.ajax.get(`/worlds/lists/${id}`).then((resp) => {
                            let doc = (new DOMParser()).parseFromString(resp, 'text/html');
                            let name = (listname == 'adminlist') ? 'admins' : listname;
                            return doc.querySelector(`[name="${name}"]`).value.split('\n');
                        });
                    })
                );
            })
            .then((lists) => {
                console.log('Building superlist.');

                let superlist = [];
                lists.forEach((list) => {
                    superlist = superlist.concat(list);
                });

                if (settings.sort) {
                    superlist.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
                }
                if (settings.remove_duplicates) {
                    superlist = this.unique(superlist);
                }

                page.innerHTML = `<h3>Step 2: Edit this list as desired.</h3><textarea style="width:100%;height:60vh;">${this.bot.stripHTML(superlist.join('\n'))}</textarea><a class="button">Continue</a>`;

                page.querySelector('a').addEventListener('click', this.stepThree);
            });
        };

        this.stepThree = (e) => {
            console.log('Step three');

            let page = e.target.parentElement;
            let listname = page.id.replace(`mb_${this.id}_`, '').replace('adminlist', 'admins');
            this.lists[listname] = page.querySelector('textarea').value;

            page.innerHTML = this.worlds.reduce((html, world) => {
                return `${html}<label><input type="checkbox" value="${world.id}"/>${this.bot.stripHTML(world.name)}</label><br>`;
            }, '<h3>Step 3: Choose which worlds to push this list to.</h3><div class="worlds">') +
            `</div>
            <hr>Mode:<br><div class="mode">
                <label><input type="radio" name="mode" value="overwrite" checked/>Overwrite</label><br>
                <label><input type="radio" name="mode" value="append"/>Append</label><br>
            </div><a class="button">Update lists</a>`;

            page.querySelector('a').addEventListener('click', this.stepFour);
        };

        this.stepFour = (e) => {
            console.log('Step four');

            let page = e.target.parentElement;
            let listname = page.id.replace(`mb_${this.id}_`, '').replace('adminlist', 'admins');
            let mode = Array.from(page.querySelectorAll('[type="radio"]'))
                        .reduce((p, c) => {return (c.checked) ? c.value : p; }, '');

            let ids = Array.from(page.querySelectorAll('.worlds input')).reduce((ids, input) => {
                if (input.checked) {
                    ids.push(input.value);
                }
                return ids;
            }, []);

            page.innerHTML = 'Saving lists...<br>';

            let setCounter = 0;
            ids.forEach((id) => {
                this.ensureOnline(id).then(() => {
                    return this.core.ajax.get(`/worlds/lists/${id}`);
                })
                .then((resp) => {
                    let doc = (new DOMParser()).parseFromString(resp, 'text/html');
                    let lists = {
                        admins: doc.querySelector('[name="admins"]').value,
                        modlist: doc.querySelector('[name="modlist"]').value,
                        whitelist: doc.querySelector('[name="whitelist"]').value,
                        blacklist: doc.querySelector('[name="blacklist"]').value,
                    };

                    switch (mode) {
                        case 'overwrite':
                            lists[listname] = this.lists[listname];
                            break;
                        case 'append':
                            lists[listname] = lists[listname] + '\n' + this.lists[listname];
                            break;
                    }

                    return this.core.ajax.postJSON(`/worlds/lists/${id}`, lists);
                })
                .then((data) => {
                    if (data.status == 'ok') {
                        return this.getStatus([id]).then((worlds) => {
                            page.innerHTML += `Updated ${this.bot.stripHTML(worlds[0].name)}'s lists.<br>`;
                        });
                    } else {
                        return this.getStatus([id]).then((worlds) => {
                            page.innerHTML += `Error updating ${this.bot.stripHTML(worlds[0].name)}'s lists.<br>`;
                        });
                    }
                })
                .then(() => {
                    setCounter++;
                    if (setCounter == ids.length) {
                        page.innerHTML += `<a class="button">Select new lists</a>`;
                        page.querySelector('a').addEventListener('click', this.stepOne);
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

    ['adminlist', 'modlist', 'whitelist', 'blacklist'].forEach((list) => {
        let page = document.querySelector(`#mb_${this.id}_${list}`);
        page.innerHTML = 'Loading...';
        this.stepOne({target: {parentElement: page}});
    });
}.bind(biblio_lists)());
