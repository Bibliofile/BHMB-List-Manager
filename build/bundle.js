(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('@bhmb/bot')) :
    typeof define === 'function' && define.amd ? define(['@bhmb/bot'], factory) :
    (factory(global['@bhmb/bot']));
}(this, (function (bot) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    function __awaiter(thisArg, _arguments, P, generator) {
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    var step1Html = "<template>\n  <label>\n    <input type=\"checkbox\" data-for=\"worldId\"/>\n    <span data-for=\"worldName\"></span>\n  </label>\n  <br>\n</template>\n\n<div class=\"container is-fluid\">\n  <div class=\"worlds\"></div>\n  <hr>\n  Settings:\n  <br>\n  <div class=\"settings\">\n    <label>\n      <input type=\"checkbox\" class=\"checkbox\" name=\"alphabeta\" />Sort created list alphabetically</label>\n    <br>\n    <label>\n      <input type=\"checkbox\" class=\"checkbox\" name=\"duplicates\" checked/>Remove duplicates (case insensitive)</label>\n    <br>\n  </div>\n  <br>\n  <a class=\"button\">Continue</a>\n</div>";

    var step2Html = "<div class=\"container is-fluid\">\n  <h3 class=\"title\">Step 2: Edit this list as desired.</h3>\n  <textarea style=\"width:100%;height:60vh;\"></textarea>\n  <a class=\"button\">Continue</a>\n</div>";

    var step3Html = "<template>\n  <label>\n    <input type=\"checkbox\" data-for=\"worldId\" />\n    <span data-for=\"worldName\"></span>\n  </label>\n  <br>\n</template>\n\n<div class=\"container is-fluid\">\n  <h3 class=\"title\">Step 3: Choose which worlds to push this list to.</h3>\n  <div class=\"worlds\">\n  </div>\n  <hr>Mode:\n  <br>\n  <div class=\"mode\">\n    <label>\n      <input class=\"radio\" type=\"radio\" name=\"mode\" value=\"overwrite\" checked/>Overwrite</label>\n    <br>\n    <label>\n      <input class=\"radio\" type=\"radio\" name=\"mode\" value=\"append\" />Append</label>\n    <br>\n  </div>\n  <a class=\"button\">Update lists</a>\n</div>\n";

    const pluck = (arr, key) => arr.map(item => item[key]);
    const flatten = (arr) => arr.reduce((carry, item) => carry.concat(item), []);
    function getWorldLists(world) {
        return __awaiter(this, void 0, void 0, function* () {
            const api = new bot.MessageBot.dependencies.Api(world);
            let overview = yield api.getOverview();
            while (overview.status !== 'online') {
                yield api.start();
                overview = yield api.getOverview();
            }
            return api.getLists();
        });
    }
    function unique(arr) {
        return [...new Set(arr)];
    }
    function createUI(list, tab, ui) {
        return __awaiter(this, void 0, void 0, function* () {
            // Show worlds
            const { worlds, settings } = yield showWorlds(tab, ui);
            // Get the lists and modify as required
            ui.notify('Getting lists');
            const lists = yield Promise.all(worlds.map(getWorldLists));
            let superList = flatten(pluck(lists, list));
            if (settings.alphabetical)
                superList.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            if (settings.removeDuplicates)
                superList = unique(superList);
            // Let the user edit the list
            superList = yield displayList(tab, superList);
            // Choose which worlds to push the new list to
            const { worlds: pushWorlds, settings: pushSettings } = yield choosePushWorlds(tab, ui);
            ui.notify('Pushing lists...');
            const requests = pushWorlds.map((world) => __awaiter(this, void 0, void 0, function* () {
                const api = new bot.MessageBot.dependencies.Api(world);
                const lists = yield getWorldLists(world);
                pushSettings.mode == 'overwrite' ? lists[list] = superList : lists[list].push(...superList);
                yield api.setLists(lists);
            }));
            yield Promise.all(requests);
            setTimeout(createUI, 1, list, tab, ui);
        });
    }
    // Todo: Extract the common functionality in showWorlds / choosePushWorlds into a helper function
    function showWorlds(tab, ui) {
        return __awaiter(this, void 0, void 0, function* () {
            const worlds = yield bot.MessageBot.dependencies.getWorlds();
            tab.innerHTML = step1Html;
            const worldsDiv = tab.querySelector('.worlds');
            const template = tab.querySelector('template');
            worlds.forEach(world => {
                ui.buildTemplate(template, worldsDiv, [
                    { selector: '[data-for=worldId]', value: world.id },
                    { selector: '[data-for=worldName]', text: world.name }
                ]);
            });
            return new Promise(resolve => {
                const button = tab.querySelector('.button');
                button.addEventListener('click', () => {
                    const ids = Array.from(worldsDiv.querySelectorAll('input'))
                        .filter(input => input.checked)
                        .map(input => input.value);
                    if (ids.length < 1) {
                        ui.notify('Please select at least one world');
                        return;
                    }
                    const settings = {
                        alphabetical: tab.querySelector('[name=alphabeta]').checked,
                        removeDuplicates: tab.querySelector('[name=duplicates]').checked,
                    };
                    resolve({ worlds: worlds.filter(({ id }) => ids.includes(id)), settings });
                });
            });
        });
    }
    function displayList(tab, list) {
        tab.innerHTML = step2Html;
        const textarea = tab.querySelector('textarea');
        const button = tab.querySelector('.button');
        textarea.textContent = list.join('\n');
        return new Promise(resolve => {
            button.addEventListener('click', () => resolve(textarea.value.split(/\r?\n/)));
        });
    }
    function choosePushWorlds(tab, ui) {
        return __awaiter(this, void 0, void 0, function* () {
            tab.innerHTML = step3Html;
            const worlds = yield bot.MessageBot.dependencies.getWorlds();
            const worldsDiv = tab.querySelector('.worlds');
            const template = tab.querySelector('template');
            worlds.forEach(world => {
                ui.buildTemplate(template, worldsDiv, [
                    { selector: '[data-for=worldId]', value: world.id },
                    { selector: '[data-for=worldName]', text: world.name }
                ]);
            });
            return new Promise(resolve => {
                const button = tab.querySelector('.button');
                button.addEventListener('click', () => {
                    const ids = Array.from(worldsDiv.querySelectorAll('input'))
                        .filter(input => input.checked)
                        .map(input => input.value);
                    if (ids.length < 1) {
                        ui.notify('Please select at least one world');
                        return;
                    }
                    const settings = {
                        mode: tab.querySelector('[name=mode]:checked').value,
                    };
                    resolve({ worlds: worlds.filter(({ id }) => ids.includes(id)), settings });
                });
            });
        });
    }
    bot.MessageBot.registerExtension('bibliofile/lists', function (ex) {
        const ui = ex.bot.getExports('ui');
        if (!ui)
            return;
        const listId = 'bibliofile/lists';
        ui.addTabGroup('Lists', listId);
        ex.remove = () => ui.removeTabGroup(listId);
        createUI('adminlist', ui.addTab('Adminlist', listId), ui);
        createUI('modlist', ui.addTab('Modlist', listId), ui);
        createUI('whitelist', ui.addTab('Whitelist', listId), ui);
        createUI('blacklist', ui.addTab('Blacklist', listId), ui);
    });

})));
//# sourceMappingURL=bundle.js.map
