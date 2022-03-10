# Pruned Schema Generation

To define the scope of a third-party integrations, you can generate a minimal or pruned schema based on the full Adobe Commerce / Magento schema and the queries that are actually used by CIF.

In this folder, you can find the queries and schemas used by the latest versions of the CIF Core Components and the CIF Add-on. Those are regularly updated. If you need to generate a schema based on older versions, please utilize the git history.

Make sure, you ran `npm install` in the root of the project. To generate a pruned schema, run `./generate.js` and follow the steps. Please use the generated schema as reference for your third-party integration.