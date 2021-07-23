/*******************************************************************************
 *
 *    Copyright 2021 Adobe. All rights reserved.
 *    This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License. You may obtain a copy
 *    of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software distributed under
 *    the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *    OF ANY KIND, either express or implied. See the License for the specific language
 *    governing permissions and limitations under the License.
 *
 ******************************************************************************/

import 'core-js/stable';
import 'regenerator-runtime/runtime';

import React from 'react';
import ReactDOM from 'react-dom';

import Runtime, { init } from '@adobe/exc-app';

import App from './components/App.js';
import './index.css';
/* Here you can bootstrap your application and configure the integration with the Adobe Experience Cloud Shell */
try {
    // attempt to load the Experience Cloud Runtime
    require('./exc-runtime');
    // if there are no errors, bootstrap the app in the Experience Cloud Shell
    init(bootstrapInExcShell);
} catch (e) {
    console.log('application not running in Adobe Experience Cloud Shell');
    // fallback mode, run the application without the Experience Cloud Runtime
    bootstrapRaw();
}

function bootstrapRaw() {
    /* **here you can mock the exc runtime and ims objects** */
    const mockRuntime = { on: () => {} };
    const mockIms = {};

    // render the actual react application and pass along the runtime object to make it available to the App
    ReactDOM.render(<App runtime={mockRuntime} ims={mockIms} />, document.getElementById('root'));
}

function bootstrapInExcShell() {
    // get the Experience Cloud Runtime object
    const runtime = Runtime();

    // use this to set a favicon
    // runtime.favicon = 'url-to-favicon'

    // use this to respond to clicks on the app-bar title
    // runtime.heroClick = () => window.alert('Did I ever tell you you\'re my hero?')

    // ready event brings in authentication/user info
    runtime.on('ready', ({ imsOrg, imsToken, imsProfile, locale }) => { // eslint-disable-line no-unused-vars
        // tell the exc-runtime object we are done
        runtime.done();
        console.log('Ready! received imsProfile:', imsProfile);
        const ims = {
            profile: imsProfile,
            org: imsOrg,
            token: imsToken
        };
        // render the actual react application and pass along the runtime and ims objects to make it available to the App
        ReactDOM.render(<App runtime={runtime} ims={ims} />, document.getElementById('root'));
    });

    // set solution info, shortTitle is used when window is too small to display full title
    runtime.solution = {
        icon: 'AdobeExperienceCloud',
        title: 'CIF GraphQL integration reference',
        shortTitle: 'CIF'
    };
    runtime.title = 'cifgraphqlreference';
}
