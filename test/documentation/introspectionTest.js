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
const resolve = require('../../actions/documentation/introspection.js').main;
const { introspectionQuery } = require('graphql');

describe('I/O Runtime action', () => {

    describe('Integration Tests', () => {

        // This test uses the generated Magento schema for 3rd-party integration

        it('Execute introspection query and get pruned schema', () => {
            return resolve({query: introspectionQuery}).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors

                let schema = result.body;

                // Queries: cart, countries, customAttributeMetadata, customer, products, category, categoryList, customerCart, categories
                let queryType = schema.data.__schema.types.find(t => t.name == 'Query');
                assert.equal(queryType.fields.length, 9);

                // Mutations: a bunch of cart and customer related queries
                let mutationType = schema.data.__schema.types.find(t => t.name == 'Mutation');
                assert.equal(mutationType.fields.length, 26);

                // Ensures the number of types does not decrease "accidentally"
                assert.equal(schema.data.__schema.types.length, 160);
            });
        });
    });
});