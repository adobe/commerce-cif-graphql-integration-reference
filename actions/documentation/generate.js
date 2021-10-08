/*******************************************************************************
 *
 *    Copyright 2019 Adobe. All rights reserved.
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

'use strict';

const magentoSchema = require('../resources/magento-schema-2.4.3ee.min.json');
const SchemaPruner = require('./SchemaPruner.js');
const gitClone = require('git-clone');
const fs = require('fs');
const path = require('path');

/**
 * This function checks out the commerce-cif-connector and aem-core-cif-components github repositories.
 * It then uses the GraphQL queries extracted during unit testing, and also the GraphQL queries defined in
 * the React components, in order to create a subset of the default Magento GraphQL schema where we only keep
 * the fields and types really used by the CIF integration.
 *
 * This "pruned" schema is then used to deploy a GraphQL introspection endpoint in Adobe I/O Runtime so that
 * it's easy to browse the parts of the schema that have to be implemented by a 3rd-party integration.
 */
function generate() {

    let schemaPruner = new SchemaPruner(magentoSchema);

    gitClone('https://github.com/adobe/commerce-cif-connector.git', 'repos/commerce-cif-connector', { shallow: true }, () => {
        gitClone('https://github.com/adobe/aem-core-cif-components.git', 'repos/aem-core-cif-components', { shallow: true }, () => {
            gitClone('git@git.corp.adobe.com:CIF/cif-on-skyline-frontend.git', 'repos/cif-on-skyline-frontend', { shallow: true }, () => {
                pruneFile(schemaPruner, path.join(__dirname, '../../repos/commerce-cif-connector/bundles/cif-connector-graphql/src/test/resources/test-queries/graphql-requests.log'));
                pruneFile(schemaPruner, path.join(__dirname, '../../repos/aem-core-cif-components/bundles/core/src/test/resources/test-queries/graphql-requests.log'));
                pruneFolder(schemaPruner, path.join(__dirname, '../../repos/aem-core-cif-components/react-components/src/queries'));

                // Include all the queries used to check the Magento version in the frontend part of the CIF Add-On
                let versions = ['2.3.5', '2.4.0', '2.4.1ce', '2.4.1ee', '2.4.2ce', '2.4.2ee'];
                versions.map(version => pruneFolder(schemaPruner, path.join(__dirname, `../../repos/cif-on-skyline-frontend/app/src/queries/${version}`)));

                let prunedSchema = schemaPruner.prune();
                fs.writeFileSync(path.join(__dirname, '../resources/magento-schema-2.4.3ee.pruned.json'), JSON.stringify(prunedSchema, null, 2));
            });
        });
    });
}

// The file contains multiple single-line queries
function pruneFile(schemaPruner, filepath) {
    let data = fs.readFileSync(filepath, 'UTF-8');
    let lines = data.split(/\r?\n/);
    lines.forEach(line => {
        if (line.trim().length > 0) {
            schemaPruner.process(line);
        }
    });
}

// The folder contains multiple files with each file containing a single query
function pruneFolder(schemaPruner, folderpath) {
    let files = fs.readdirSync(folderpath);
    files
        .filter(file => file.endsWith('.graphql'))
        .forEach(file => {
            let query = fs.readFileSync(path.join(folderpath, file), 'UTF-8');
            schemaPruner.process(query);
        });

    files
        .filter(file => file.endsWith('.graphql.js'))
        .forEach(file => {
            let query = fs.readFileSync(path.join(folderpath, file), 'UTF-8');
            let begin = query.indexOf('`');
            let end = query.lastIndexOf('`');
            schemaPruner.process(query.substring(begin + 1, end - 1));
        });
}

generate();
