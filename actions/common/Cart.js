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

const LoaderProxy = require('./LoaderProxy.js');
const { Product } = require('./Catalog.js');
const CartLoader = require('./CartLoader.js');
const ProductLoader = require('./ProductLoader.js');
const ProductsLoader = require('./ProductsLoader.js');
const CategoryTreeLoader = require('./CategoryTreeLoader.js');

class Cart {
    /**
     * @param {Object} parameters
     * @param {String} parameters.cartId The cart id.
     * @param {Object} [parameters.graphqlContext] The optional GraphQL execution context passed to the resolver.
     * @param {Object} [parameters.actionParameters] Some optional parameters of the I/O Runtime action, like for example authentication info.
     */
    constructor(parameters) {
        this.cartId = parameters.cartId;
        this.graphqlContext = parameters.graphqlContext;
        this.actionParameters = parameters.actionParameters;
        this.cartLoader = new CartLoader(parameters.actionParameters);

        /**
         * This class returns a Proxy to avoid having to implement a getter for all properties.
         */
        return new LoaderProxy(this);
    }

    __load() {
        console.debug(`Loading cart for ${this.cartId}`);
        return this.cartLoader.load(this.cartId);
    }

    /**
     * Converts some cart data from the 3rd-party commerce system into the Magento GraphQL format.
     * Properties that require some extra data fetching with the 3rd-party system must have dedicated getters
     * in this class.
     *
     * @param {Object} data
     * @returns {Object} The backend cart data converted into a GraphQL "Cart" data.
     */
    __convertData(data) {
        return {
            email: data.email,
            prices: {
                grand_total: {
                    currency: data.totalPrice.currency,
                    value: data.totalPrice.amount
                }
            }
        };
    }

    get items() {
        let productLoader = new ProductLoader(this.actionParameters);

        // These are required to optimize caching in case the user requests the
        // "categories" field of each product, and then the "products" field of
        // each category.
        let productsLoader = new ProductsLoader(this.actionParameters);
        let categoryTreeLoader = new CategoryTreeLoader(this.actionParameters);

        return this.__load().then(() => {
            if (!this.data.entries || this.data.entries.length == 0) {
                return [];
            }

            return this.data.entries.map((entry, idx) => {
                return {
                    __typename: 'SimpleCartItem',
                    id: idx,
                    quantity: entry.quantity,
                    product: () =>
                        productLoader.load(entry.sku).then(
                            (data) =>
                                new Product({
                                    productData: data,
                                    graphqlContext: this.graphqlContext,
                                    actionParameters: this.actionParameters,
                                    categoryTreeLoader: categoryTreeLoader,
                                    productsLoader: productsLoader
                                })
                        )
                };
            });
        });
    }
}

module.exports = Cart;
