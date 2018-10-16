import { MessageBot } from '@bhmb/bot'
import { UIExtensionExports } from '@bhmb/ui'
import { WorldInfo, WorldLists } from 'blockheads-api-interface'

import step1Html from './step1.html'
import step2Html from './step2.html'
import step3Html from './step3.html'

interface SortSettings {
  alphabetical: boolean
  removeDuplicates: boolean
}

interface PushSettings {
  mode: 'overwrite' | 'append'
}

const pluck = <T, K extends keyof T>(arr: T[], key: K): Array<T[K]> => arr.map(item => item[key])
const flatten = <T>(arr: T[][]): T[] => arr.reduce((carry, item) => carry.concat(item), [])

async function getWorldLists(world: WorldInfo) {
  const api = new MessageBot.dependencies.Api(world)
  let overview = await api.getOverview()
  while (overview.status !== 'online') {
    await api.start()
    overview = await api.getOverview()
  }
  return api.getLists()
}

function unique(arr: string[]) {
  return [...new Set(arr)]
}

async function createUI(list: keyof WorldLists, tab: HTMLDivElement, ui: UIExtensionExports) {
  // Show worlds
  const { worlds, settings } = await showWorlds(tab, ui)

  // Get the lists and modify as required
  ui.notify('Getting lists')
  const lists = await Promise.all(worlds.map(getWorldLists))
  let superList = flatten(pluck(lists, list))
  if (settings.alphabetical) superList.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  if (settings.removeDuplicates) superList = unique(superList)

  // Let the user edit the list
  superList = await displayList(tab, superList)

  // Choose which worlds to push the new list to
  const { worlds: pushWorlds, settings: pushSettings } = await choosePushWorlds(tab, ui)
  ui.notify('Pushing lists...')
  const requests = pushWorlds.map(async world => {
    const api = new MessageBot.dependencies.Api(world)
    const lists = await getWorldLists(world)
    pushSettings.mode == 'overwrite' ? lists[list] = superList : lists[list].push(...superList)
    await api.setLists(lists)
  })

  await Promise.all(requests)
  setTimeout(createUI, 1, list, tab, ui)
}

// Todo: Extract the common functionality in showWorlds / choosePushWorlds into a helper function

async function showWorlds(tab: HTMLDivElement, ui: UIExtensionExports): Promise<{worlds: WorldInfo[], settings: SortSettings}> {
  const worlds = await MessageBot.dependencies.getWorlds()
  tab.innerHTML = step1Html
  const worldsDiv = tab.querySelector('.worlds') as HTMLDivElement
  const template = tab.querySelector('template') as HTMLTemplateElement
  worlds.forEach(world => {
    ui.buildTemplate(template, worldsDiv, [
      { selector: '[data-for=worldId]', value: world.id },
      { selector: '[data-for=worldName]', text: world.name }
    ])
  })

  return new Promise <{ worlds: WorldInfo[], settings: SortSettings }>(resolve => {
    const button = tab.querySelector('.button') as HTMLElement
    button.addEventListener('click', () => {
      const ids = Array.from(worldsDiv.querySelectorAll('input'))
        .filter(input => input.checked)
        .map(input => input.value)

      if (ids.length < 1) {
        ui.notify('Please select at least one world')
        return
      }

      const settings: SortSettings = {
        alphabetical: (tab.querySelector('[name=alphabeta]') as HTMLInputElement).checked,
        removeDuplicates: (tab.querySelector('[name=duplicates]') as HTMLInputElement).checked,
      }

      resolve({ worlds: worlds.filter(({id}) => ids.includes(id)), settings })
    })
  })
}

function displayList(tab: HTMLDivElement, list: string[]): Promise<string[]> {
  tab.innerHTML = step2Html
  const textarea = tab.querySelector('textarea') as HTMLTextAreaElement
  const button = tab.querySelector('.button') as HTMLElement
  textarea.textContent = list.join('\n')
  return new Promise<string[]>(resolve => {
    button.addEventListener('click', () => resolve(textarea.value.split(/\r?\n/)))
  })
}

async function choosePushWorlds(tab: HTMLDivElement, ui: UIExtensionExports): Promise<{worlds: WorldInfo[], settings: PushSettings }> {
  tab.innerHTML = step3Html
  const worlds = await MessageBot.dependencies.getWorlds()
  const worldsDiv = tab.querySelector('.worlds') as HTMLDivElement
  const template = tab.querySelector('template') as HTMLTemplateElement
  worlds.forEach(world => {
    ui.buildTemplate(template, worldsDiv, [
      { selector: '[data-for=worldId]', value: world.id },
      { selector: '[data-for=worldName]', text: world.name }
    ])
  })

  return new Promise<{ worlds: WorldInfo[], settings: PushSettings }>(resolve => {
    const button = tab.querySelector('.button') as HTMLElement
    button.addEventListener('click', () => {
      const ids = Array.from(worldsDiv.querySelectorAll('input'))
        .filter(input => input.checked)
        .map(input => input.value)

      if (ids.length < 1) {
        ui.notify('Please select at least one world')
        return
      }

      const settings: PushSettings = {
        mode: (tab.querySelector('[name=mode]:checked') as HTMLInputElement).value as 'overwrite' | 'append',
      }

      resolve({ worlds: worlds.filter(({ id }) => ids.includes(id)), settings })
    })
  })
}


MessageBot.registerExtension('bibliofile/lists', function(ex) {
  const ui = ex.bot.getExports('ui') as UIExtensionExports | undefined
  if (!ui) return
  const listId = 'bibliofile/lists'
  ui.addTabGroup('Lists', listId)
  ex.remove = () => ui.removeTabGroup(listId)

  createUI('adminlist', ui.addTab('Adminlist', listId), ui)
  createUI('modlist', ui.addTab('Modlist', listId), ui)
  createUI('whitelist', ui.addTab('Whitelist', listId), ui)
  createUI('blacklist', ui.addTab('Blacklist', listId), ui)
})
