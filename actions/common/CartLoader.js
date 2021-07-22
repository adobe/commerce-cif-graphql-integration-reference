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

const DataLoader = require('dataloader');

class CartLoader {
    /**
     * @param {Object} [actionParameters] Some optional parameters of the I/O Runtime action, like for example authentication info.
     */
    constructor(actionParameters) {
        // The loading function: "cartIds" is an Array of cart ids
        let loadingFunction = (cartIds) => {
            // This loader loads each cart one by one, but if the 3rd party backend allows it,
            // it could also fetch all carts in one single request. In this case, the method
            // must still return an Array of carts with the same order as the keys.
            return Promise.resolve(
                cartIds.map((cartId) => {
                    console.debug(`--> Fetching cart with id ${cartId}`);
                    return this.__getCartById(cartId, actionParameters).catch((error) => {
                        console.error(`Failed loading cart ${cartId}, got error ${JSON.stringify(error, null, 0)}`);
                        return null;
                    });
                })
            );
        };

        this.loader = new DataLoader((keys) => loadingFunction(keys));
    }

    /**
     * Loads the cart with the given cartId.
     *
     * @param {*} cartId
     * @returns {Promise} A Promise with the cart data.
     */
    load(cartId) {
        return this.loader.load(cartId);
    }

    /**
     * In a real 3rd-party integration, this method would query the 3rd-party system
     * in order to fetch a cart based on the cart id. This method returns a Promise,
     * for example to simulate some HTTP REST call being performed to the 3rd-party commerce system.
     *
     * @param {String} cartId The cart id.
     * @param {Object} actionParameters Some parameters of the I/O action itself (e.g. backend server URL, authentication info, etc)
     * @returns {Promise} A Promise with the cart data.
     */
    __getCartById(cartId, actionParameters) { // eslint-disable-line no-unused-vars

        // Each cart entry only has the sku of the product: the function CartItem.product()
        // demonstrates how each product will be fetched if they are being requested in the GraphQL query.
        return Promise.resolve({
            id: cartId,
            email: 'dummy@example.com',
            entries: [
                {
                    quantity: 1,
                    sku: 'product-1',
                    unitPrice: 12.34,
                    entryPrice: 24.68
                },
                {
                    quantity: 2,
                    sku: 'product-2',
                    unitPrice: 56.78,
                    entryPrice: 113.56
                }
            ],
            totalPrice: {
                currency: 'USD',
                amount: 138.24
            }
        });
    }
}

module.exports = CartLoader;
