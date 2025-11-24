import { connectDB } from "./db.js";
import { mongoose } from 'mongoose';


await connectDB();
const client = mongoose.connection.getClient()


async function ensureCollection(name, validator) {
    try {
        const db = mongoose.connection.db;

        // Try modifying existing collection
        await db.command({
            collMod: name,
            validator,
            validationAction: "error",
            validationLevel: "strict",
        });
        console.log(`✅ Updated existing collection: ${name}`);
    } catch (err) {
        // If collMod fails, create collection instead
        if (err.codeName === "NamespaceNotFound") {
            await db.createCollection(name, {
                validator,
                validationAction: "error",
                validationLevel: "strict",
            });
            console.log(`🆕 Created new collection: ${name}`);
        } else {
            console.error(`❌ Error setting up ${name}:`, err);
        }
    }
}

await ensureCollection("directories", {
    $jsonSchema: {
        bsonType: "object",
        required: ["_id", "name", "parentDirId", "userId"],
        properties: {
            _id: { bsonType: "objectId" },
            name: { bsonType: "string" },
            parentDirId: { bsonType: ["objectId", "null"] },
            userId: { bsonType: "objectId" },
            __v: {
                bsonType: 'int'
            },
        },
    },
});
await ensureCollection("users", {
    $jsonSchema: {
        bsonType: "object",
        required: ["_id", "email", "name", "rootDirId"],
        properties: {
            _id: { bsonType: "objectId" },
            email: { bsonType: "string", pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
            picture: {
                bsonType: "string"
            },
            role: {
                bsonType: "string",
                enum: ['Admin', 'Manager', "User", "Owner"],
            },
            deleted: {
                bsonType: "bool"
            },
            name: { bsonType: "string", minLength: 3 },
            password: { bsonType: "string" },
            rootDirId: { bsonType: "objectId" },
            __v: {
                bsonType: 'int'
            },
        },
    },
});

await ensureCollection("files", {
    $jsonSchema: {
        bsonType: "object",
        required: ["_id", "extension", "name", "parentDirId"],
        properties: {
            _id: { bsonType: "objectId" },
            extension: { bsonType: "string" },
            name: { bsonType: "string" },
            parentDirId: { bsonType: "objectId" },
            __v: {
                bsonType: 'int'
            },
        },
    },
});



await client.close();
console.log("✅ All collections configured and client closed.");
