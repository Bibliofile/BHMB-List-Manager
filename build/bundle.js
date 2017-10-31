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
/* global Reflect, Promise */













function __awaiter(thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

var step1Html = "<template>\r\n  <label>\r\n    <input type=\"checkbox\" data-for=\"worldId\"/>\r\n    <span data-for=\"worldName\"></span>\r\n  </label>\r\n  <br>\r\n</template>\r\n\r\n<div class=\"worlds\"></div>\r\n<hr>Settings:\r\n<br>\r\n<div class=\"settings\">\r\n  <label>\r\n    <input type=\"checkbox\" class=\"checkbox\" name=\"alphabeta\" />Sort created list alphabetically</label>\r\n  <br>\r\n  <label>\r\n    <input type=\"checkbox\" class=\"checkbox\" name=\"duplicates\" checked/>Remove duplicates (case insensitive)</label>\r\n  <br>\r\n</div>\r\n<br>\r\n<a class=\"button\">Continue</a>";

var step2Html = "<h3 class=\"title\">Step 2: Edit this list as desired.</h3>\r\n<textarea style=\"width:100%;height:60vh;\"></textarea>\r\n<a class=\"button\">Continue</a>";

var step3Html = "<template>\r\n  <label>\r\n    <input type=\"checkbox\" class=\"checkbox\" />\r\n  </label>\r\n  <br>\r\n</template>\r\n\r\n<h3 class=\"title\">Step 3: Choose which worlds to push this list to.</h3>\r\n<div class=\"worlds\">\r\n</div>\r\n<hr>Mode:\r\n<br>\r\n<div class=\"mode\">\r\n  <label>\r\n    <input class=\"radio\" type=\"radio\" name=\"mode\" value=\"overwrite\" checked/>Overwrite</label>\r\n  <br>\r\n  <label>\r\n    <input class=\"radio\" type=\"radio\" name=\"mode\" value=\"append\" />Append</label>\r\n  <br>\r\n</div>\r\n<a class=\"button\">Update lists</a>";

const pluck = (arr, key) => arr.map(item => item[key]);
const flatten = (arr) => arr.reduce((carry, item) => carry.concat(item), []);
function getWorldLists(world) {
    return __awaiter(this, void 0, void 0, function* () {
        let api = new bot.MessageBot.dependencies.Api(world);
        let overview = yield api.getOverview();
        while (overview.status != 'online') {
            yield api.start();
            overview = yield api.getOverview();
        }
        return api.getLists();
    });
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
function createUI(list, tab, ui) {
    return __awaiter(this, void 0, void 0, function* () {
        // Show worlds
        let { worlds, settings } = yield showWorlds(tab, ui);
        // Get the lists and modify as required
        ui.notify('Getting lists');
        let lists = yield Promise.all(worlds.map(getWorldLists));
        let superList = flatten(pluck(lists, list));
        if (settings.alphabetical)
            superList.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        if (settings.removeDuplicates)
            superList = unique(superList);
        // Let the user edit the list
        superList = yield displayList(tab, superList);
        // Choose which worlds to push the new list to
        let { worlds: pushWorlds, settings: pushSettings } = yield choosePushWorlds(tab, ui);
        ui.notify('Pushing lists...');
        let requests = pushWorlds.map((world) => __awaiter(this, void 0, void 0, function* () {
            let api = new bot.MessageBot.dependencies.Api(world);
            let lists = yield getWorldLists(world);
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
        let worlds = yield bot.MessageBot.dependencies.getWorlds();
        tab.innerHTML = step1Html;
        let worldsDiv = tab.querySelector('.worlds');
        let template = tab.querySelector('template');
        worlds.forEach(world => {
            ui.buildTemplate(template, worldsDiv, [
                { selector: '[data-for=worldId]', value: world.id },
                { selector: '[data-for=worldName]', value: world.name }
            ]);
        });
        return new Promise(resolve => {
            let button = tab.querySelector('.button');
            button.addEventListener('click', () => {
                let ids = Array.from(worldsDiv.querySelectorAll('input'))
                    .filter(input => input.checked)
                    .map(input => input.value);
                if (ids.length < 1) {
                    ui.notify('Please select at least one world');
                    return;
                }
                let settings = {
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
    let textarea = tab.querySelector('textarea');
    let button = tab.querySelector('.button');
    textarea.textContent = list.join('\n');
    return new Promise(resolve => {
        button.addEventListener('click', () => resolve(textarea.value.split(/\r?\n/)));
    });
}
function choosePushWorlds(tab, ui) {
    return __awaiter(this, void 0, void 0, function* () {
        tab.innerHTML = step3Html;
        let worlds = yield bot.MessageBot.dependencies.getWorlds();
        let worldsDiv = tab.querySelector('.worlds');
        let template = tab.querySelector('template');
        worlds.forEach(world => {
            ui.buildTemplate(template, worldsDiv, [
                { selector: '[data-for=worldId]', value: world.id },
                { selector: '[data-for=worldName]', value: world.name }
            ]);
        });
        return new Promise(resolve => {
            let button = tab.querySelector('.button');
            button.addEventListener('click', () => {
                let ids = Array.from(worldsDiv.querySelectorAll('input'))
                    .filter(input => input.checked)
                    .map(input => input.value);
                if (ids.length < 1) {
                    ui.notify('Please select at least one world');
                    return;
                }
                let settings = {
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
