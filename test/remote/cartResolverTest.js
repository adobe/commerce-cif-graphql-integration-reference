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

const sinon = require('sinon');
const assert = require('chai').assert;
const expect = require('chai').expect;
const { CartLoader } = require('../../src/common/CartLoader.js');

// The cart resolver
const resolve = require('../../src/remote/cartResolver.js').main;

describe('Cart Resolver', () => {

    before(() => {
        // Disable console debugging
        sinon.stub(console, 'debug');
        sinon.stub(console, 'error');
    });

    after(() => {
        console.debug.restore();
        console.error.restore();
    });

    describe('Unit Tests', () => {

        let url = 'https://mybackendserver.com/rest';

        it('Basic cart request', () => {
            return resolve({
                query: '{cart(cart_id:"abcd"){email,prices{grand_total{currency,value}},items{id,quantity,product{sku,name,description{html},categories{name,description}}}}}',
                url: url
            }).then(result => {
                assert.isUndefined(result.errors); // No GraphQL errors

                let cart = result.data.cart;
                assert.equal(cart.email, 'dummy@example.com');

                let grandTotal = cart.prices.grand_total;
                assert.equal(grandTotal.currency, 'USD');
                assert.equal(grandTotal.value, '138.24');

                let items = cart.items;
                assert.equal(items.length, 2);
                items.forEach((item, idx) => {
                    let id = idx + 1;
                    assert.equal(item.id, idx);
                    assert.equal(item.quantity, id);

                    let product = item.product;
                    assert.equal(product.sku, `product-${id}`);
                    assert.equal(product.name, `Product #product-${id}`);
                    assert.equal(product.description.html, `Fetched product #${product.sku} from ${url}`);

                    let categories = product.categories;
                    assert.equal(categories.length, 2);
                    categories.forEach((category, idx) => {
                        let id = idx + 1;
                        assert.equal(category.name, `Category #cat${id}`);
                        assert.equal(category.description, `Fetched category #cat${id} from ${url}`);
                    });
                });
            });
        });

        it('Mutation: create empty cart', () => {
            return resolve({
                query: 'mutation {createEmptyCart}',
                url: url
            }).then(result => {
                assert.isUndefined(result.errors); // No GraphQL errors

                let response = result.data.createEmptyCart;
                assert.equal(response, 'thisisthenewcartid');
            });
        });

        it('Error when fetching the cart data', () => {
            let stub = sinon.stub(CartLoader.prototype, '__getCartById').returns(Promise.reject('Connection failed'));
            return resolve({
                query: '{cart(cart_id:"abcd"){email}}',
                url: url
            }).then(result => {
                assert.equal(result.errors.length, 1);
                assert.equal(result.errors[0].message, 'Backend data is null');
                expect(result.errors[0].path).to.eql(['cart', 'email']);
            }).finally(() => {
                stub.restore();
            });
        });

    });
});
