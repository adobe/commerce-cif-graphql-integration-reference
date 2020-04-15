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

const magentoSchema = require('../resources/magento-schema-2.3.4.min.json');
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

    gitClone('https://github.com/adobe/commerce-cif-connector.git', 'repos/commerce-cif-connector', {shallow: true}, () => {
        gitClone('https://github.com/adobe/aem-core-cif-components.git', 'repos/aem-core-cif-components', {shallow: true}, () => {
            pruneFile(schemaPruner, path.join(__dirname, '../../repos/commerce-cif-connector/bundles/cif-connector-graphql/src/test/resources/test-queries/graphql-requests.log'));
            pruneFile(schemaPruner, path.join(__dirname, '../../repos/aem-core-cif-components/bundles/core/src/test/resources/test-queries/graphql-requests.log'));
            pruneFolder(schemaPruner, path.join(__dirname, '../../repos/aem-core-cif-components/react-components/src/queries'));

            let prunedSchema = schemaPruner.prune();
            fs.writeFileSync(path.join(__dirname, '../resources/magento-schema-2.3.4.pruned.json'), JSON.stringify(prunedSchema, null, 2));
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
    files.forEach(file => {
        let query = fs.readFileSync(path.join(folderpath, file), 'UTF-8');
        schemaPruner.process(query);
    })
}

generate();