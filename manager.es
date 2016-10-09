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

(function(ex, ui, api) {
    ex.setAutoLaunch(true);
    ex.uninstall = function() {
        //Remove all our tabs
        ui.removeTabGroup('biblio_lists');
    };

    ui.addTabGroup('Lists', 'biblio_lists');
    var tab = {
        admin: ui.addTab('Adminlist', 'biblio_lists'),
        mod: ui.addTab('Modlist', 'biblio_lists'),
        white: ui.addTab('Whitelist', 'biblio_lists'),
        black: ui.addTab('Blacklist', 'biblio_lists'),
    };
    Object.keys(tab).forEach(key => {
        tab[key].dataset.listName = key;
    });

    //Used to save lists between steps
    ex.lists = {
        admin: '',
        mod: '',
        white: '',
        black: '',
    };

    function setTabHTML(name, html) {
        name = name.toLocaleLowerCase();

        if (name == 'all') {
            Object.keys(tab).forEach(key => {
                tab[key].innerHTML = html;
            });
        } else {
            tab[name].innerHTML = html;
        }
    }

    function setTabListener(name, selector, type, listener) {
        name = name.toLocaleLowerCase();

        if (name == 'all') {
            Object.keys(tab).forEach(key => {
                tab[key].querySelector(selector).addEventListener(type, listener);
            });
        } else {
            tab[name].querySelector(selector).addEventListener(type, listener);
        }
    }

    function unique(arr) {
        let seen = new Set();
        return arr.filter((item) => {
            if (!seen.has(item.toLocaleUpperCase())) {
                seen.add(item.toLocaleUpperCase());
                return true;
            }
        });
    }

    function stripHTML(html) {
        return html
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '&apos;')
            .replace(/"/g, '&quot;');
    }

    //Let the user know we are waiting.
    setTabHTML('all', 'Loading...');
    showWorlds('all');

    //Load the worlds
    function showWorlds(tabName) {
        api.getWorlds().then(function(worlds) {
            console.log('Worlds fetched...', worlds);

            var html = worlds.reduce((html, world) => {
                return `${html}<label><input type="checkbox" value="${world.id}"/>${stripHTML(world.name)} (${world.worldStatus})</label><br>`;
            }, '<h3>Step 1: Choose the worlds you want to combine lists from.</h3><div class="worlds">');
            html += `</div>
                <hr>Settings:<br>
                <div class="settings">
                    <label><input type="checkbox" name="alphabeta"/>Sort created list alphabetically</label><br>
                    <label><input type="checkbox" name="duplicates" checked/>Remove duplicates (case insensitive)</label><br>
                </div><br>
                <a class="button">Continue</a>`;

            setTabHTML(tabName, html);
            setTabListener(tabName, 'a', 'click', getWorldLists);
        });
    }

    function getWorldLists(event) {
        var content = event.target.parentElement;
        var listName = content.dataset.listName;
        var settings = {
            sort: content.querySelector('[name="alphabeta"]').checked,
            remove_duplicates: content.querySelector('[name="duplicates"]').checked,
        };

        var ids = Array.from(content.querySelectorAll('.worlds input:checked')).reduce((ids, input) => {
            ids.push(input.value);
            return ids;
        }, []);

        if (ids.length < 2) {
            ex.ui.notify('Please select at least two worlds.');
            return;
        }

        content.innerHTML = 'Starting worlds and getting lists...';

        Promise.all(
            ids.map(id => api.getLists(id))
        ).then(lists => {
            return lists.reduce((superlist, worldLists) => {
                return superlist.concat(worldLists[listName]);
            }, []);
        }).then(superlist => {
            if (settings.sort) {
                superlist.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            }
            if (settings.remove_duplicates) {
                superlist = unique(superlist);
            }
            return superlist;
        }).then(superlist => {
            content.innerHTML = `<h3>Step 2: Edit this list as desired.</h3><textarea style="width:100%;height:60vh;">${stripHTML(superlist.join('\n'))}</textarea><a class="button">Continue</a>`;

            content.querySelector('a').addEventListener('click', choosePushWorlds);
        });
    }

    function choosePushWorlds(event) {
        var content = event.target.parentElement;
        var listName = content.dataset.listName;

        ex.lists[listName] = content.querySelector('textarea').value;

        api.getWorlds().then(worlds => {
            content.innerHTML = worlds.reduce((html, world) => {
                return `${html}<label><input type="checkbox" value="${world.id}"/>${stripHTML(world.name)}</label><br>`;
            }, '<h3>Step 3: Choose which worlds to push this list to.</h3><div class="worlds">') +
            `</div>
            <hr>Mode:<br><div class="mode">
                <label><input type="radio" name="mode" value="overwrite" checked/>Overwrite</label><br>
                <label><input type="radio" name="mode" value="append"/>Append</label><br>
            </div><a class="button">Update lists</a>`;

            content.querySelector('a').addEventListener('click', saveLists);
        });
    }

    function saveLists(event) {
        var content = event.target.parentElement;
        var listName = content.dataset.listName;

        var mode = content.querySelector('[type=radio]:checked').value;

        var ids = Array.from(content.querySelectorAll('.worlds input:checked')).reduce((ids, input) => {
            ids.push(input.value);
            return ids;
        }, []);

        content.innerHTML = 'Saving lists...<br>';

        Promise.all(
            ids.map(id => api.getLists(id).then(lists => {
                console.log('Got lists', lists);
                var sendLists = {
                    admins: lists.admin.join('\n'),
                    modlist: lists.mod.join('\n'),
                    whitelist: lists.white.join('\n'),
                    blacklist: lists.black.join('\n'),
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

                return ex.ajax.postJSON(`/worlds/lists/${lists.id}`, sendLists)
                    .then(result => [result, lists.id]);
            }).then((data) => {
                var [response, id] = data;
                console.log('Saved lists?', response.status);
                var result = (response.status == 'ok') ? 'Success' : 'Failed';
                return api.getWorlds().then(worlds => {
                    worlds.forEach(world => {
                        if (id == world.id) {
                            content.innerHTML += `${stripHTML(world.name)}: ${result}<br>`;
                        }
                    });
                });
            }))
        ).then(() => {
            //All done!
            content.innerHTML += `<a class="button">Select new lists</a>`;
            content.querySelector('a').addEventListener('click', () => showWorlds(listName));
        });
    }
}(biblio_lists, biblio_lists.ui, (function(ajax) {
    //Api
    var cache = {};

    var api = {};

    api.ensureOnline = (id) => {
        ajax.postJSON('/api', {command: 'start', worldId: id});

        return new Promise((resolve, reject) => {
            let tries = 0;
            (function waitForStart() {
                ajax.postJSON('/api', {command: 'status', worldId: id}).then((world) => {
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
            }());
        });
    };

    api.getStatus = id => ajax.postJSON(`/api`, {command: 'status', worldId: id});

    api.getLists = id => {
        return api.ensureOnline(id).then(() => ajax.get(`/worlds/lists/${id}`))
            .then((html) => {
                var doc = (new DOMParser()).parseFromString(html, 'text/html');

                function getList(name) {
                    var list = doc.querySelector(`textarea[name=${name}]`)
                        .value
                        .toLocaleUpperCase()
                        .split('\n');
                    return [...new Set(list)]; //Remove duplicates
                }

                var admin = getList('admins');
                var mod = getList('modlist');
                mod = mod.filter((name) => admin.indexOf(name) < 0 );
                var staff = admin.concat(mod);

                var white = getList('whitelist');
                var black = getList('blacklist');

                return {admin, mod, staff, white, black, id};
            });
    };

    api.getWorlds = () => {
        if (cache.getWorlds) {
            return cache.getWorlds;
        }

        cache.getWorlds = ajax.get('/worlds').then((resp) => {
            let doc = (new DOMParser()).parseFromString(resp, 'text/html');
            var worlds = [];

            doc.body.querySelector('script').textContent.split('\n').forEach((line) => {
                if (line.startsWith('\t\t\tupdateWorld')) {
                    let needed = line
                                    .substring(15, line.length - 1)
                                    .replace(/(['"])?(\w+)(['"])?: (')?(.*?)(')?([,}])/gi, '"$2": "$5"$7');

                    worlds.push(JSON.parse(needed));
                }
            });

            return worlds;
        });

        return cache.getWorlds;
    };


    return api;
}(biblio_lists.ajax))));
