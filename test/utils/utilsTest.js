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

"use strict";

const sinon = require("sinon");
const expect = require("chai").expect;

const utils = require("../../actions/utils");

describe("utils.js", () => {
    let logger = sinon.spy();

    describe("errorResponse", () => {
        it("(400, errorMessage, logger)", () => {
            const res = utils.errorResponse(400, "errorMessage", logger);
            expect(res).to.deep.equal({
                error: {
                    statusCode: 400,
                    body: { error: "errorMessage" },
                },
            });
        });
    });

    describe("stringParameters", () => {
        it("no auth header", () => {
            const params = {
                a: 1,
                b: 2,
                __ow_headers: { "x-api-key": "fake-api-key" },
            };
            expect(utils.stringParameters(params)).to.equal(
                JSON.stringify(params)
            );
        });
        it("with auth header", () => {
            const params = {
                a: 1,
                b: 2,
                __ow_headers: {
                    "x-api-key": "fake-api-key",
                    authorization: "secret",
                },
            };
            expect(utils.stringParameters(params)).to.include(
                '"authorization":"<hidden>"'
            );
            expect(utils.stringParameters(params)).not.to.equal("secret");
        });
    });

    describe("checkMissingRequestInputs", () => {
        it("({ a: 1, b: 2 }, [a])", () => {
            expect(
                utils.checkMissingRequestInputs({ a: 1, b: 2 }, ["a"])
            ).to.equal(null);
        });
        it("({ a: 1 }, [a, b])", () => {
            expect(
                utils.checkMissingRequestInputs({ a: 1 }, ["a", "b"])
            ).to.equal("missing parameter(s) 'b'");
        });
        it("({ a: { b: { c: 1 } }, f: { g: 2 } }, [a.b.c, f.g.h.i])", () => {
            expect(
                utils.checkMissingRequestInputs(
                    { a: { b: { c: 1 } }, f: { g: 2 } },
                    ["a.b.c", "f.g.h.i"]
                )
            ).to.equal("missing parameter(s) 'f.g.h.i'");
        });
        it("({ a: { b: { c: 1 } }, f: { g: 2 } }, [a.b.c, f.g.h])", () => {
            expect(
                utils.checkMissingRequestInputs(
                    { a: { b: { c: 1 } }, f: { g: 2 } },
                    ["a.b.c", "f"]
                )
            ).to.equal(null);
        });
        it("({ a: 1, __ow_headers: { h: 1, i: 2 } }, undefined, [h])", () => {
            expect(
                utils.checkMissingRequestInputs(
                    { a: 1, __ow_headers: { h: 1, i: 2 } },
                    undefined,
                    ["h"]
                )
            ).to.equal(null);
        });
        it("({ a: 1, __ow_headers: { f: 2 } }, [a], [h, i])", () => {
            expect(
                utils.checkMissingRequestInputs(
                    { a: 1, __ow_headers: { f: 2 } },
                    ["a"],
                    ["h", "i"]
                )
            ).to.equal("missing header(s) 'h,i'");
        });
        it("({ c: 1, __ow_headers: { f: 2 } }, [a, b], [h, i])", () => {
            expect(
                utils.checkMissingRequestInputs(
                    { c: 1 },
                    ["a", "b"],
                    ["h", "i"]
                )
            ).to.equal(
                "missing header(s) 'h,i' and missing parameter(s) 'a,b'"
            );
        });
        it("({ a: 0 }, [a])", () => {
            expect(utils.checkMissingRequestInputs({ a: 0 }, ["a"])).to.equal(
                null
            );
        });
        it("({ a: null }, [a])", () => {
            expect(
                utils.checkMissingRequestInputs({ a: null }, ["a"])
            ).to.equal(null);
        });
        it("({ a: '' }, [a])", () => {
            expect(utils.checkMissingRequestInputs({ a: "" }, ["a"])).to.equal(
                "missing parameter(s) 'a'"
            );
        });
        it("({ a: undefined }, [a])", () => {
            expect(
                utils.checkMissingRequestInputs({ a: undefined }, ["a"])
            ).to.equal("missing parameter(s) 'a'");
        });
    });

    describe("getBearerToken", () => {
        it("({})", () => {
            expect(utils.getBearerToken({})).to.equal(undefined);
        });
        it("({ authorization: Bearer fake, __ow_headers: {} })", () => {
            expect(
                utils.getBearerToken({
                    authorization: "Bearer fake",
                    __ow_headers: {},
                })
            ).to.equal(undefined);
        });
        it("({ authorization: Bearer fake, __ow_headers: { authorization: fake } })", () => {
            expect(
                utils.getBearerToken({
                    authorization: "Bearer fake",
                    __ow_headers: { authorization: "fake" },
                })
            ).to.equal(undefined);
        });
        it("({ __ow_headers: { authorization: Bearerfake} })", () => {
            expect(
                utils.getBearerToken({
                    __ow_headers: { authorization: "Bearerfake" },
                })
            ).to.equal(undefined);
        });
        it("({ __ow_headers: { authorization: Bearer fake} })", () => {
            expect(
                utils.getBearerToken({
                    __ow_headers: { authorization: "Bearer fake" },
                })
            ).to.equal("fake");
        });
        it("({ __ow_headers: { authorization: Bearer fake Bearer fake} })", () => {
            expect(
                utils.getBearerToken({
                    __ow_headers: { authorization: "Bearer fake Bearer fake" },
                })
            ).to.equal("fake Bearer fake");
        });
    });
});
