# CIF Schemas

Make sure to run `npm install` in the root of the project before using any of the tools below.

## Pruned Schema Generation

To define the scope of a third-party integration, you can generate a minimal or pruned schema based on the full Adobe Commerce / Magento schema and the queries that are actually used by CIF.

In this folder, you can find the queries and schemas used by the latest versions of the CIF Core Components and the CIF Add-on. Those are regularly updated. Schemas of previous versions of the CIF Core Components are available in the git history and are tagged.

To generate a pruned schema, run `./generate.js` and follow the steps. Please use the generated schema as reference for your third-party integration.

## Compatibility Check

The GraphQL schema checker tool allows you to test the schema of your implemented GraphQL endpoint for compatibility with CIF. This includes the CIF Core Components and the CIF Add-on.
The tool will provide detailed information about possible incompatibilities.

Please run `./check.js` and follow the steps provided.