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

const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');
const magentoSchema = require('../../actions/resources/magento-schema-2.4.3ee.min.json');
const SchemaPruner = require('../../actions/documentation/SchemaPruner.js');

describe('Schema Pruner', () => {

    describe('Unit Tests', () => {

        // This test uses a few CIF queries selected to cover all parsing cases

        it('Prune schema with GraphQL queries', () => {
            let data = fs.readFileSync(path.join(__dirname, '../resources/graphql-queries.graphql'), 'UTF-8');
            let schemaPruner = new SchemaPruner(magentoSchema);
            let lines = data.split(/\r?\n/);
            lines.forEach(line => {
                if (line.trim().length > 0) {
                    schemaPruner.process(line);
                }
            });
            let schema = schemaPruner.prune();

            let queryType = schema.data.__schema.types.find(t => t.name == 'Query');
            assert.equal(queryType.fields.length, 3); // products, category, and customAttributeMetadata

            let mutationType = schema.data.__schema.types.find(t => t.name == 'Mutation');
            assert.equal(mutationType.fields.length, 2); // createCustomer and addSimpleProductsToCart
        });
    });
});
