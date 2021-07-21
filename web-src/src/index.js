/*
* <license header>
*/

import regeneratorRuntime from 'regenerator-runtime'
import Runtime, { init } from '@adobe/exc-app'
import actions from './config.json'
import actionWebInvoke from './utils.js'

let state = {}

window.onload = () => {
  /* Here you can bootstrap your application and configure the integration with the Adobe Experience Cloud Shell */
  try {
    // attempt to load the Experience Cloud Runtime
    require('./exc-runtime')
    // if there are no errors, bootstrap the app in the Experience Cloud Shell
    init(initRuntime)
  } catch (e) {
    console.log('application not running in Adobe Experience Cloud Shell')
    // fallback mode, run the application without the Experience Cloud Runtime
  }

  showActionsList()
  document.getElementById('actionForm').onsubmit = (event) => {
    event.preventDefault();
    setTimeout(doSubmit, 1)
  }
}

/**
 * Initialize runtime and get IMS profile
 */
function initRuntime() {
  // get the Experience Cloud Runtime object
  const runtime = Runtime()
  // ready event brings in authentication/user info
  runtime.on('ready', ({ imsOrg, imsToken, imsProfile, locale }) => {
    // tell the exc-runtime object we are done
    runtime.done()
    state = { imsOrg, imsToken, imsProfile, locale }
    console.log('exc-app:ready')
  })
  // set solution info, shortTitle is used when window is too small to display full title
  runtime.solution = {
    icon: 'AdobeExperienceCloud',
    title: 'test-raw'
  }
  runtime.title = 'test-raw'
}

/**
 * Generate list of actions
 */
function showActionsList() {
  const container = document.getElementById('action-list')
  if (Object.keys(actions).length === 0) {
    container.innerHTML = '<span>you have no actions, run <code>aio app add actions</code> to add one</span>'
  } else {
    container.innerHTML = '<select id="selAction">' + Object.entries(actions).map(([actionName]) => `<option>${actionName}</option>`).join('') + '</select>'
  }
}
/**
 * Quick helper to safely call JSON.parse
 * @param {string} val 
 */
function safeParse(val) {
  let result = null
  try {
    result = JSON.parse(val)
  } catch (e) { }
  return result
}

/**
 * Submit the form, and get a result back from the action
 */
function doSubmit() {
  const actionIndex = document.getElementById('selAction').selectedIndex || 0;
  const taOutput = document.getElementById('taOutput')
  taOutput.innerHTML = "calling action ..."
  if (actions) {
    const selAction = Object.entries(actions)[actionIndex]
    const headers = safeParse(document.getElementById('actionHeaders').value)
    const params = safeParse(document.getElementById('actionParams').value)
    // track the time to a result
    const preCallTime = Date.now()
    let outputHTML = ''
    invokeAction(selAction, headers, params)
    .then(actionResponse => {
      outputHTML = JSON.stringify(actionResponse, 0, 2)
    }).catch(err => {
      console.error('Error:', err)
      outputHTML = err.message
    }).finally(( ) => {
      taOutput.innerHTML = `time:${(Date.now() - preCallTime)}ms\n\n ${outputHTML}`
    })
  }
}

async function invokeAction(action, _headers, _params) {
  const headers = _headers || {}
  const params = _params || {}
  // all headers to lowercase
  Object.keys(headers).forEach((h) => {
    const lowercase = h.toLowerCase()
    if (lowercase !== h) {
      headers[lowercase] = headers[h]
      headers[h] = undefined
      delete headers[h]
    }
  })
  // set the authorization header and org from the ims props object
  if (state.imsToken && !headers.authorization) {
    headers.authorization = `Bearer ${state.imsToken}`
  }
  if (state.imsOrg && !headers['x-gw-ims-org-id']) {
    headers['x-gw-ims-org-id'] = state.imsOrg
  }
  // action is [name, url]
  const result = await actionWebInvoke(action[1], headers, params)
  return result
}
