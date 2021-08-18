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
const mockRequire = require('mock-require');
const ProductsLoader = require('../../actions/common/ProductsLoader.js');
const CategoryTreeLoader = require("../../actions/common/CategoryTreeLoader.js");
const CartLoader = require("../../actions/common/CartLoader.js");
const ProductLoader = require("../../actions/common/ProductLoader.js");
const fs = require('fs');

describe('Dispatcher Resolver', () => {

    let resolve;
    let cleanCachedSchema;

    let searchProducts;
    let getProductBySku;
    let getCategoryById;
    let getCartById;
    let cachedFiles = new Set();

    before(() => {
        // Disable console debugging
        sinon.stub(console, 'debug');
        sinon.stub(console, 'warn');
        sinon.stub(console, 'error');

        // Mock openwhisk client
        mockRequire('openwhisk', () => {
            return {
                actions: {
                    invoke: (options) => {
                        let resolve = require(options.actionName).main;
                        return resolve({
                            query: options.params.query,
                            variables: options.params.variables,
                            operationName: options.params.operationName,
                            context: options.params.context
                        });
                    }
                }
            }
        });

        // Mock aio-lib-state library, caching objects in files
        mockRequire('@adobe/aio-lib-state', {
            init: () => {
                return {
                    get: (key) => {
                        return fs.existsSync(`test/${key}.cache`) ? JSON.parse(fs.readFileSync(`test/${key}.cache`)) : null;
                    },
                    put: (key, value) => {
                        cachedFiles.add(`test/${key}.cache`);
                        fs.writeFileSync(`test/${key}.cache`, JSON.stringify({value}));
                    }
                }
            }
        });

        // The main dispatcher resolver (will use the mock openwhisk client)
        resolve = require("../../actions/local/dispatcher").main;
        cleanCachedSchema = require('../../actions/local/dispatcher').cleanCacheSchema;
    });

    after(() => {
        console.debug.restore();
        console.warn.restore();
        console.error.restore();
        cachedFiles.forEach(name => fs.unlinkSync(name));
    });

    beforeEach(() => {
        // We "spy" all the loading functions
        searchProducts = sinon.spy(ProductsLoader.prototype, '__searchProducts');
        getProductBySku = sinon.spy(ProductLoader.prototype, '__getProductBySku');
        getCategoryById = sinon.spy(CategoryTreeLoader.prototype, '__getCategoryById');
        getCartById = sinon.spy(CartLoader.prototype, '__getCartById');
    })

    afterEach(() => {
        searchProducts.restore();
        getProductBySku.restore();
        getCategoryById.restore();
        getCartById.restore();
    });

    describe('Integration Tests', () => {

        let args = {
            url: 'https://mybackendserver.com/rest',
            remoteSchemas: {
                cart: {
                    order: 20,
                    action: '../../actions/remote/cartResolver.js'
                }
            },
            variables: "{}",
            "use-aio-cache": 3600
        };

        it('Basic products search', () => {
            args.query = '{products(search:"short", currentPage:1){total_count,page_info{current_page,page_size},items{__typename,sku,name,description{html},price{regularPrice{amount{currency,value}}}}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors

                let products = result.body.data.products;
                assert.equal(products.total_count, 2);             

                let pageInfo = products.page_info;
                assert.equal(pageInfo.current_page, 1);
                assert.equal(pageInfo.page_size, 20);

                let items = products.items;
                assert.equal(items.length, 2);
                items.forEach((item, idx) => {
                    let id = idx + 1;
                    assert.equal(item.__typename, 'SimpleProduct');
                    assert.equal(item.sku, `product-${id}`);
                    assert.equal(item.name, `Product #${id}`);
                    assert.equal(item.description.html, `Fetched product #${id} from ${args.url}`);

                    let price = item.price.regularPrice.amount;
                    assert.equal(price.currency, 'USD');
                    assert.equal(price.value, idx == 0 ? 12.34 : 56.78);
                });

                // Ensure the Products search function is only called once
                assert(searchProducts.calledOnceWith({
                    search: "short",
                    pageSize: 20,
                    currentPage: 1
                }, args));

            });
        });

        it('Category tree query - CIF version < 1.0.0', () => {
            args.query = '{category(id:1){id,name,description,children{id,name,description,children{id,name,description}}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors

                let category = result.body.data.category;
                assert.equal(category.id, 1);
                assert.equal(category.name, 'Category #1');

                let children = category.children;
                assert.equal(children.length, 2);
                children.forEach((subcategory, idx) => {
                    let id = category.id * 10 + idx + 1;
                    assert.equal(subcategory.name, `Category #${id}`);
                    assert.equal(subcategory.description, `Fetched category #${id} from ${args.url}`);
                    let subchildren = subcategory.children;
                    assert.equal(subchildren.length, 2);
                    subchildren.forEach((subsubcategory, idx2) => {
                        let id2 = id * 10 + idx2 + 1;
                        assert.equal(subsubcategory.name, `Category #${id2}`);
                        assert.equal(subsubcategory.description, `Fetched category #${id2} from ${args.url}`);
                    });
                });

                // Ensure the category loading function is only called once for each category being fetched
                assert.equal(getCategoryById.callCount, 7);
                assert(getCategoryById.calledWith(1, args));
                assert(getCategoryById.calledWith(11, args));
                assert(getCategoryById.calledWith(12, args));
                assert(getCategoryById.calledWith(111, args));
                assert(getCategoryById.calledWith(112, args));
                assert(getCategoryById.calledWith(121, args));
                assert(getCategoryById.calledWith(122, args));

                cleanCachedSchema(); // This will enforce the cache loading via aio-lib-state in the next test
            });
        });

        it('Category tree query - CIF version = 1.0.0', () => {
            args.query = '{categoryList(filters:{ids:{eq:"1"}}){id,name,description,children_count,children{id,name,description,children_count,children{id,name,description,children_count,children{id}}}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors

                let category = result.body.data.categoryList[0];
                assert.equal(category.id, 1);
                assert.equal(category.name, 'Category #1');

                let children = category.children;
                assert.equal(category.children_count, "2"); // children_count is a String in the Magento schema
                assert.equal(children.length, 2);
                children.forEach((subcategory, idx) => {
                    let id = category.id * 10 + idx + 1;
                    assert.equal(subcategory.name, `Category #${id}`);
                    assert.equal(subcategory.description, `Fetched category #${id} from ${args.url}`);
                    let subchildren = subcategory.children;
                    assert.equal(category.children_count, "2");
                    assert.equal(subchildren.length, 2);
                    subchildren.forEach((subsubcategory, idx2) => {
                        let id2 = id * 10 + idx2 + 1;
                        assert.equal(subsubcategory.name, `Category #${id2}`);
                        assert.equal(subsubcategory.description, `Fetched category #${id2} from ${args.url}`);
                        assert.equal(subsubcategory.children_count, "0");
                        assert.equal(subsubcategory.children.length, 0);
                    });
                });

                // Ensure the category loading function is only called once for each category being fetched
                assert.equal(getCategoryById.callCount, 7);
                assert(getCategoryById.calledWith("1", args));
                assert(getCategoryById.calledWith(11, args));
                assert(getCategoryById.calledWith(12, args));
                assert(getCategoryById.calledWith(111, args));
                assert(getCategoryById.calledWith(112, args));
                assert(getCategoryById.calledWith(121, args));
                assert(getCategoryById.calledWith(122, args));

                cleanCachedSchema(); // This will enforce the cache loading via aio-lib-state in the next test
            });
        });

        // We "parameterized" the next test, once searching by sku and once by url_key
        let eqTests = [
            {eq: 'sku', value: 'a-sku'},
            {eq: 'url_key', value: 'a-slug'},
        ];

        eqTests.forEach(test => {
            it(`Combined products filter by ${test.eq} and category search`, () => {
                args.query = `{products(filter:{${test.eq}:{eq:"${test.value}"}}, currentPage:1){items{sku,url_key,categories{id}}}, category(id:1){id,products{items{sku}}}}`;
                return resolve(args).then(result => {
                    assert.isUndefined(result.body.errors); // No GraphQL errors

                    let items = result.body.data.products.items;
                    assert.equal(items.length, 1);
                    assert.equal(items[0].sku, test.value);
                    assert.equal(items[0].url_key, test.value);
                    
                    let categories = items[0].categories;
                    assert.equal(categories.length, 2);
                    categories.forEach((category, idx) => {
                        let id = idx + 1;
                        assert.equal(category.id, id);
                    });

                    let products = result.body.data.category.products;
                    assert.equal(products.items.length, 2);
                    products.items.forEach((item, idx) => {
                        let id = idx + 1;
                        assert.equal(item.sku, `product-${id}`);
                    });

                    // Ensure the Products search function is called once for the "search by (sku | url_key)"
                    // and once for the category products
                    let filter = {};
                    filter[test.eq] = {eq: test.value};

                    assert(searchProducts.calledTwice);
                    assert(searchProducts.calledWith({
                        filter,
                        pageSize: 20,
                        currentPage: 1
                    }, args));
                    assert(searchProducts.calledWith({
                        categoryId: 1,
                        pageSize: 20,
                        currentPage: 1
                    }, args));
                    
                    // Ensure the category loading function is only called once for each category being fetched
                    assert.equal(getCategoryById.callCount, 2);
                    assert(getCategoryById.calledWith(1, args));
                    assert(getCategoryById.calledWith(2, args));
                });
            });
        });

        it('Products search by skus', () => {
            args.query = '{products(filter:{sku:{in:["a-sku", "b-sku"]}}, currentPage:1){items{sku}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors

                let items = result.body.data.products.items;
                assert.equal(items.length, 2);
                assert.equal(items[0].sku, 'a-sku');
                assert.equal(items[1].sku, 'b-sku');

                // Ensure the Products search function is called once
                assert(searchProducts.calledOnceWith({
                    filter: {
                        sku: {
                            in: ['a-sku', 'b-sku']
                        }
                    },
                    pageSize: 20,
                    currentPage: 1
                }, args));

            });
        });

        it('customAttributeMetadata: is in schema but always returns null', () => {
            args.query = '{customAttributeMetadata(attributes:[{attribute_code:"name",entity_type:"4"},{attribute_code:"price",entity_type:"4"}]){items{attribute_code,attribute_type,input_type}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors
                assert.isNull(result.body.data.customAttributeMetadata);
            });
        });

        it('Query cart remote resolver', () => {
            args.query = '{products(filter:{sku:{in:["a-sku", "b-sku"]}}, currentPage:1){items{sku}}, cart(cart_id:"abcd"){email,items{product{sku}}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors

                let items = result.body.data.products.items;
                assert.equal(items.length, 2);
                assert.equal(items[0].sku, 'a-sku');
                assert.equal(items[1].sku, 'b-sku');

                let cart = result.body.data.cart;
                assert.equal(cart.email, 'dummy@example.com');

                let cartItems = cart.items;
                assert.equal(cartItems.length, 2);
                cartItems.forEach((item, idx) => {
                    let id = idx + 1;
                    let product = item.product;
                    assert.equal(product.sku, `product-${id}`);
                });

                // Ensure the Products search function is called once
                assert(searchProducts.calledOnceWith({
                    filter: {
                        sku: {
                            in: ['a-sku', 'b-sku']
                        }
                    },
                    pageSize: 20,
                    currentPage: 1
                }, args));

                // Ensure the cart loading function is only called once
                // (we dont check the 'args' parameter because this is modified by graphql-tools)
                assert(getCartById.calledOnceWith('abcd'));

                // Ensure the product loading function is only called twice, once for each product sku
                // (we dont check the 'args' parameter because this is modified by graphql-tools)
                assert(getProductBySku.calledTwice);
                assert(getProductBySku.calledWith('product-1'));
                assert(getProductBySku.calledWith('product-2'));
            });
        });

        it('Category products - CIF version < 1.0.0', () => {
            args.query = '{category(id:211){id,description,name,image,product_count,products(currentPage:1,pageSize:6){items{__typename,id,sku,name,small_image{url},url_key,price_range{minimum_price{regular_price{value,currency},final_price{value,currency},discount{amount_off,percent_off}}},... on ConfigurableProduct{price_range{maximum_price{regular_price{value,currency},final_price{value,currency},discount{amount_off,percent_off}}}}},total_count}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors

                let products = result.body.data.category.products;
                assert.equal(products.total_count, 2);             

                let items = products.items;
                assert.equal(items.length, 2);
                items.forEach((item, idx) => {
                    let id = idx + 1;
                    assert.equal(item.__typename, 'SimpleProduct');
                    assert.equal(item.sku, `product-${id}`);
                    assert.equal(item.name, `Product #${id}`);

                    let finalPrice = item.price_range.minimum_price.final_price;
                    assert.equal(finalPrice.currency, 'USD');
                    assert.equal(finalPrice.value, idx == 0 ? 12.34 : 56.78);

                    let regularPrice = item.price_range.minimum_price.regular_price;
                    assert.equal(regularPrice.currency, 'USD');
                    assert.equal(regularPrice.value, idx == 0 ? 12.34 : 56.78);

                    let discount = item.price_range.minimum_price.discount;
                    assert.equal(discount.amount_off, 0);
                    assert.equal(discount.percent_off, 0);
                });
            });
        });

        it('Category products - CIF version = 1.0.0', () => {
            args.query = '{products(currentPage:1,pageSize:6,filter:{category_id:{eq:"211"}}){total_count,items{__typename,id,sku,name,small_image{url},url_key,price_range{minimum_price{regular_price{value,currency},final_price{value,currency},discount{amount_off,percent_off}}},... on ConfigurableProduct{price_range{maximum_price{regular_price{value,currency},final_price{value,currency},discount{amount_off,percent_off}}}}},aggregations{options{count,label,value},attribute_code,count,label}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors

                let products = result.body.data.products;
                assert.equal(products.total_count, 2);             

                let items = products.items;
                assert.equal(items.length, 2);
                items.forEach((item, idx) => {
                    let id = idx + 1;
                    assert.equal(item.__typename, 'SimpleProduct');
                    assert.equal(item.sku, `product-${id}`);
                    assert.equal(item.name, `Product #${id}`);

                    let finalPrice = item.price_range.minimum_price.final_price;
                    assert.equal(finalPrice.currency, 'USD');
                    assert.equal(finalPrice.value, idx == 0 ? 12.34 : 56.78);

                    let regularPrice = item.price_range.minimum_price.regular_price;
                    assert.equal(regularPrice.currency, 'USD');
                    assert.equal(regularPrice.value, idx == 0 ? 12.34 : 56.78);

                    let discount = item.price_range.minimum_price.discount;
                    assert.equal(discount.amount_off, 0);
                    assert.equal(discount.percent_off, 0);
                });

                assert.isNull(products.aggregations); // Not supported by example integration
            });
        });

        it('Products search in picker', () => {
            args.query = '{products(search:"test",sort:{relevance:DESC},currentPage:1,pageSize:20){items{__typename,id,sku,name,url_key,updated_at,thumbnail{url}}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors
                assert.equal(result.body.data.products.items.length, 2);             
            });
        });

        it('Category search in picker', () => {
            args.query = '{categoryList(filters:{name:{match:"test"}}){id,name,url_path,url_key}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors
                assert.equal(result.body.data.categoryList.length, 1);             
            });
        });

        it('Products search in AEM Assets panel', () => {
            args.query = '{products(filter:{price:{from:""}},sort:{relevance:DESC},currentPage:1,pageSize:20){items{__typename,id,sku,name,url_key,updated_at,thumbnail{url}}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors
                assert.equal(result.body.data.products.items.length, 2);             
            });
        });

        it('Test that the custom "shoppinglist" and "ProductInterface" fields can be queried', () => {
            args.query = '{shoppinglist(id:"whatever"){id,products{sku,rating,accessories{sku},country_of_origin}}}';
            return resolve(args).then(result => {
                assert.isUndefined(result.body.errors); // No GraphQL errors
            });
        });

        it('Error when fetching the products data', () => {
            // Replace spy with stub
            searchProducts.restore();
            searchProducts = sinon.stub(ProductsLoader.prototype, '__searchProducts').returns(Promise.reject('Connection failed'));

            args.query = '{products(search: "short", currentPage: 1){total_count}}';
            return resolve(args).then(result => {
                assert.equal(result.body.errors.length, 1);
                assert.equal(result.body.errors[0].message, 'Backend data is null');
                expect(result.body.errors[0].path).to.eql(['products', 'total_count']);
            });
        });

        it('Error when fetching the product data', () => {
            // Replace spy with stub
            getProductBySku.restore();
            getProductBySku = sinon.stub(ProductLoader.prototype, '__getProductBySku').returns(Promise.reject('Connection failed'));

            args.query = '{cart(cart_id:"abcd"){email,items{product{sku}}}}';
            return resolve(args).then(result => {
                assert.equal(result.body.errors.length, 2);
                assert.equal(result.body.errors[0].message, 'Backend data is null');
                expect(result.body.errors[0].path).to.eql(['cart', 'items', 0, 'product', 'sku']);
                assert.equal(result.body.errors[1].message, 'Backend data is null');
                expect(result.body.errors[1].path).to.eql(['cart', 'items', 1, 'product', 'sku']);
            });
        });

        it('Error when fetching the category data', () => {
            // Replace spy with stub
            getCategoryById.restore();
            getCategoryById = sinon.stub(CategoryTreeLoader.prototype, '__getCategoryById').returns(Promise.reject('Connection failed'));

            args.query = '{category(id:1){id}}';
            return resolve(args).then(result => {
                assert.equal(result.body.errors.length, 1);
                assert.equal(result.body.errors[0].message, 'Backend data is null');
                expect(result.body.errors[0].path).to.eql(['category', 'id']);
            });
        });

        it('Error when fetching the cart data', () => {
            // Replace spy with stub
            getCartById.restore();
            getCartById = sinon.stub(CartLoader.prototype, '__getCartById').returns(Promise.reject('Connection failed'));
            
            args.query = '{cart(cart_id:"abcd"){email}}';
            return resolve(args).then(result => {
                assert.equal(result.body.errors.length, 1);
                assert.equal(result.body.errors[0].message, 'Backend data is null');
                expect(result.body.errors[0].path).to.eql(['cart', 'email']);
            });
        });

    });
});