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
const CartLoader = require("../../actions/common/CartLoader.js");
const ProductLoader = require("../../actions/common/ProductLoader.js");

// The cart resolver
const resolve = require("../../actions/remote/cartResolver.js").main;

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

    describe('Integration Tests', () => {

        let args = {
            url: 'https://mybackendserver.com/rest'
        };

        it('Basic cart request', () => {
            let getCartById = sinon.spy(CartLoader.prototype, '__getCartById');
            let getProductBySku = sinon.spy(ProductLoader.prototype, '__getProductBySku');
            args.query = '{cart(cart_id:"abcd"){email,prices{grand_total{currency,value}},items{id,quantity,product{sku,name,description{html},categories{name,description}}}}}';
            return resolve(args).then(result => {
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
                    assert.equal(product.description.html, `Fetched product #${product.sku} from ${args.url}`);

                    let categories = product.categories;
                    assert.equal(categories.length, 2);
                    categories.forEach((category, idx) => {
                        let id = idx + 1;
                        assert.equal(category.name, `Category #cat${id}`);
                        assert.equal(category.description, `Fetched category #cat${id} from ${args.url}`);
                    });
                });

                // Ensure the Cart loading function is only called once
                assert(getCartById.calledOnceWith('abcd', args));

                // Ensure the product loading function is only called twice, once for each product sku
                assert(getProductBySku.calledTwice);
                assert(getProductBySku.calledWith('product-1', args));
                assert(getProductBySku.calledWith('product-2', args));

            }).finally(() => {
                getCartById.restore();
                getProductBySku.restore();
            });
        });

        it('Mutation: create empty cart', () => {
            args.query = 'mutation {createEmptyCart}';
            return resolve(args).then(result => {
                assert.isUndefined(result.errors); // No GraphQL errors

                let response = result.data.createEmptyCart;
                assert.equal(response, 'thisisthenewcartid');
            });
        });

        it('Error when fetching the cart data', () => {
            let stub = sinon.stub(CartLoader.prototype, '__getCartById').returns(Promise.reject('Connection failed'));
            args.query = '{cart(cart_id:"abcd"){email}}';
            return resolve(args).then(result => {
                assert.equal(result.errors.length, 1);
                assert.equal(result.errors[0].message, 'Backend data is null');
                expect(result.errors[0].path).to.eql(['cart', 'email']);
            }).finally(() => {
                stub.restore();
            });
        });

    });
});
