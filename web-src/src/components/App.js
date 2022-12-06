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

import React from 'react';
import PropTypes from 'prop-types';
import GraphiQL from 'graphiql';
import 'graphiql/graphiql.min.css';

import actions from '../config.json';

const App = props => {
    console.log('runtime object:', props.runtime);
    console.log('ims object:', props.ims);

    // use exc runtime event handlers
    // respond to configuration change events (e.g. user switches org)
    props.runtime.on('configuration', ({ imsOrg, imsToken, locale }) => {
        console.log('configuration change', { imsOrg, imsToken, locale });
    });
    // respond to history change events
    props.runtime.on('history', ({ type, path }) => {
        console.log('history change', { type, path });
    });

    // extract the GraphQL dispatcher function url
    let url = ``;
    if ('dispatcher' in actions) {
        url = actions.dispatcher;
        console.log('GraphQL url', { url });
    }

    return (
        <GraphiQL
            style={{ height: '100vh' }}
            fetcher={async (graphQLParams) => {
                const data = await fetch(url.replace('adobeio-static', 'adobeioruntime'),{
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'x-ow-extra-logging': 'on'
                    },
                    body: JSON.stringify(graphQLParams),
                    credentials: 'same-origin'
                });
                return data.json().catch(() => data.text());
            }}
        />
    );
}

App.propTypes = {
    runtime: PropTypes.object,
    ims: PropTypes.object
};

export default App;
