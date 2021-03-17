/*******************************************************************************
 *
 *    Copyright 2021 Adobe. All rights reserved.
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
'use strict'

const { parse } = require('graphql');

module.exports = [
    parse(`{
  products(search: "glove") {
    items {
      __typename
      id
      url_key
      name
      small_image {
        label
        url
      }
      ... on ConfigurableProduct {
        price_range {
          maximum_price {
            regular_price {
              value
              currency
            }
            final_price {
              value
              currency
            }
            discount {
              amount_off
              percent_off
            }
          }
          minimum_price {
            regular_price {
              value
              currency
            }
            final_price {
              value
              currency
            }
            discount {
              amount_off
              percent_off
            }
          }
        }
      }
      ... on SimpleProduct {
        price_range {
          minimum_price {
            regular_price {
              value
              currency
            }
            final_price {
              value
              currency
            }
            discount {
              amount_off
              percent_off
            }
          }
        }
      }
    }
  }
}`),
    parse(`{
  category(id: 2) {
    id
    name
    url_path
    position
    children {
      id
      name
      url_path
      position
      children {
        id
        name
        url_path
        position
        children {
          id
          name
          url_path
          position
          children {
            id
            name
            url_path
            position
            children {
              id
              name
              url_path
              position
            }
          }
        }
      }
    }
  }
}`),
    parse(`{
  customAttributeMetadata(attributes: []) {
    items {
      attribute_code
      attribute_type
      input_type
    }
  }
}`),
    parse(`mutation createAccount($email: String, $firstname: String, $lastname: String, $password: String) {
  createCustomer(
    input: {email: $email, firstname: $firstname, lastname: $lastname, password: $password}
  ) {
    customer {
      email
      firstname
      lastname
    }
  }
}`),
    parse(`mutation ($cartId: String!, $sku: String!, $quantity: Float!) {
  addSimpleProductsToCart(
    input: {cart_id: $cartId, cart_items: [{data: {quantity: $quantity, sku: $sku}}]}
  ) {
    cart {
      items {
        id
        quantity
        product {
          name
        }
      }
    }
  }
}`),
    parse(`mutation ($cartId: String!, $cartItems: [SimpleProductCartItemInput]!) {
  addSimpleProductsToCart(input: {cart_id: $cartId, cart_items: $cartItems}) {
    cart {
      items {
        id
        quantity
        product {
          name
        }
      }
    }
  }
}`)];
