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

const ProductsLoader = require('./ProductsLoader.js');
const CategoryTreeLoader = require('./CategoryTreeLoader.js');
const LoaderProxy = require('./LoaderProxy.js');

// This module contains 3 classes because they have cross/cyclic dependencies to each other
// and it's not possible to have them in separate files because this is not supported by Javascript

class CategoryTree {
    /**
     * @param {Object} parameters
     * @param {String} parameters.categoryId The category id.
     * @param {Object} [parameters.graphqlContext] The optional GraphQL execution context passed to the resolver.
     * @param {Object} [parameters.actionParameters] Some optional parameters of the I/O Runtime action, like for example authentication info.
     * @param {CategoryTreeLoader} [parameters.categoryTreeLoader] An optional CategoryTreeLoader, to optimise caching.
     * @param {ProductsLoader} [parameters.productsLoader] An optional ProductsLoader, to optimise caching.
     */
    constructor(parameters) {
        this.categoryId = parameters.categoryId;
        this.graphqlContext = parameters.graphqlContext;
        this.actionParameters = parameters.actionParameters;
        this.categoryTreeLoader = parameters.categoryTreeLoader || new CategoryTreeLoader(parameters.actionParameters);
        this.productsLoader = parameters.productsLoader || new ProductsLoader(parameters.actionParameters);

        /**
         * This class returns a Proxy to avoid having to implement a getter for all properties.
         */
        return new LoaderProxy(this);
    }

    __load() {
        console.debug(`Loading category for ${this.categoryId}`);
        return this.categoryTreeLoader.load(this.categoryId);
    }

    /**
     * Converts some category data from the 3rd-party commerce system into the Magento GraphQL format.
     * Properties that require some extra data fetching with the 3rd-party system must have dedicated getters
     * in this class.
     *
     * @param {Object} data
     * @returns {Object} The backend category data converted into a GraphQL "CategoryTree" data.
     */
    __convertData(data) {
        return {
            uid: data.uid,
            url_key: data.uid,
            url_path: data.slug,
            name: data.title,
            description: data.description,
            product_count: 2
        };
    }

    get __typename() {
        return 'CategoryTree';
    }

    get children() {
        return this.__load().then(() => {
            if (!this.data.subcategories || this.data.subcategories.length == 0) {
                return [];
            }

            return this.data.subcategories.map(
                (categoryId) =>
                    new CategoryTree({
                        categoryId: categoryId,
                        graphqlContext: this.graphqlContext,
                        actionParameters: this.actionParameters,
                        categoryTreeLoader: this.categoryTreeLoader,
                        productsLoader: this.productsLoader
                    })
            );
        });
    }

    // children_count is a String in the Magento schema
    get children_count() {
        return this.__load().then(() => {
            if (!this.data.subcategories || this.data.subcategories.length == 0) {
                return '0';
            }
            return this.data.subcategories.length.toString();
        });
    }

    // Getters cannot have arguments, so we define a function
    products(params) {
        // We don't need to call this.__load() here because only fetching the products
        // of a category does not require fetching the category itself

        return new Products({
            search: {
                categoryId: this.categoryId,
                pageSize: params.pageSize,
                currentPage: params.currentPage
            },
            graphqlContext: this.graphqlContext,
            actionParameters: this.actionParameters,
            productsLoader: this.productsLoader,
            categoryTreeLoader: this.categoryTreeLoader
        });
    }
}

class Products {
    /**
     * @param {Object} parameters
     * @param {Object} parameters.search The "search" argument of the GraphQL "products" field, with an optional categoryId property.
     * @param {Object} [parameters.graphqlContext] The optional GraphQL execution context passed to the resolver.
     * @param {Object} [parameters.actionParameters] Some optional parameters of the I/O Runtime action, like for example authentication info.
     * @param {ProductsLoader} [parameters.productsLoader] An optional ProductsLoader, to optimise caching.
     * @param {CategoryTreeLoader} [parameters.categoryTreeLoader] An optional CategoryTreeLoader, to optimise caching.
     */
    constructor(parameters) {
        this.search = parameters.search;
        this.graphqlContext = parameters.graphqlContext;
        this.actionParameters = parameters.actionParameters;
        this.productsLoader = parameters.productsLoader || new ProductsLoader(parameters.actionParameters);
        this.categoryTreeLoader = parameters.categoryTreeLoader || new CategoryTreeLoader(parameters.actionParameters);

        /**
         * This class returns a Proxy to avoid having to implement a getter for all properties.
         */
        return new LoaderProxy(this);
    }

    __load() {
        console.debug('Loading products for ' + JSON.stringify(this.search, null, 0));
        return this.productsLoader.load(this.search);
    }

    /**
     * Converts some products data from the 3rd-party commerce system into the Magento GraphQL format.
     * Properties that require some extra data fetching with the 3rd-party system must have dedicated getters
     * in this class.
     *
     * @param {Object} data
     * @returns {Object} The backend products data converted into a GraphQL "Products" data.
     */
    __convertData(data) {
        return {
            total_count: data.total,
            page_info: {
                current_page: data.offset / data.limit,
                page_size: data.limit
            }
        };
    }

    get items() {
        return this.__load().then(() => {
            if (!this.data.products || this.data.products.length == 0) {
                return [];
            }

            return this.data.products.map((productData) => {
                return new Product({
                    productData: productData,
                    graphqlContext: this.graphqlContext,
                    actionParameters: this.actionParameters,
                    categoryTreeLoader: this.categoryTreeLoader,
                    productsLoader: this.productsLoader
                });
            });
        });
    }
}

class Product {
    /**
     * @param {Object} parameters
     * @param {Object} parameters.productData The product data from the 3rd-party system.
     * @param {Object} [parameters.graphqlContext] The optional GraphQL execution context passed to the resolver.
     * @param {Object} [parameters.actionParameters] Some optional parameters of the I/O Runtime action, like for example authentication info.
     * @param {CategoryTreeLoader} [parameters.categoryTreeLoader] An optional CategoryTreeLoader, to optimise caching.
     * @param {ProductsLoader} [parameters.productsLoader] An optional ProductsLoader, to optimise caching.
     */
    constructor(parameters) {
        this.productData = parameters.productData;
        this.graphqlContext = parameters.graphqlContext;
        this.actionParameters = parameters.actionParameters;
        this.categoryTreeLoader = parameters.categoryTreeLoader || new CategoryTreeLoader(parameters.actionParameters);
        this.productsLoader = parameters.productsLoader || new ProductsLoader(parameters.actionParameters);

        /**
         * This class returns a Proxy to avoid having to implement a getter for all properties.
         */
        return new LoaderProxy(this);
    }

    get __typename() {
        return 'SimpleProduct';
    }

    get categories() {

        console.log("mhhhh")
        console.log(this.productData.categoryIds);

        return this.productData.categoryIds.map((categoryId) => {
            return new CategoryTree({
                categoryId: categoryId,
                graphqlContext: this.graphqlContext,
                actionParameters: this.actionParameters,
                categoryTreeLoader: this.categoryTreeLoader,
                productsLoader: this.productsLoader
            });
        });
    }

    __load() {
        return Promise.resolve(this.productData);
    }

    __convertData(data) {
        return {
            uid: data.sku,
            sku: data.sku,
            url_key: data.sku,
            name: data.title,
            description: {
                html: data.description
            },
            price_range: {
                maximum_price: {
                    final_price: {
                        currency: data.price.currency,
                        value: data.price.amount
                    },
                    regular_price: {
                        currency: data.price.currency,
                        value: data.price.amount
                    },
                    discount: {
                        amount_off: 0,
                        percent_off: 0
                    }
                },
                minimum_price: {
                    final_price: {
                        currency: data.price.currency,
                        value: data.price.amount
                    },
                    regular_price: {
                        currency: data.price.currency,
                        value: data.price.amount
                    },
                    discount: {
                        amount_off: 0,
                        percent_off: 0
                    }
                }
            },
            small_image: {
                url: data.image_url,
                label: data.title
            },
            image: {
                url: data.image_url,
                label: data.title
            },
            thumbnail: {
                url: data.image_url,
                label: data.title
            },
            media_gallery: [
                {
                    __typename: 'ProductImage',
                    url: data.image_url,
                    disabled: false,
                    position: 0
                }
            ]
        };
    }
}

module.exports.Products = Products;
module.exports.CategoryTree = CategoryTree;
module.exports.Product = Product;
