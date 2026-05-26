/**
 * MongoDB Connection Utility
 * Singleton pattern for connection pooling
 */

import { MongoClient, Db } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const uri = process.env.MONGODB_URI;
const options = {
  maxPoolSize: 10,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable to preserve the client across module reloads
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

/**
 * Get MongoDB database instance
 * @returns Promise<Db>
 */
export async function getDatabase(): Promise<Db> {
  const client = await clientPromise;
  // Extract database name from connection string or use default
  const dbName = process.env.MONGODB_DB_NAME || "elysium-bot";
  return client.db(dbName);
}

/**
 * Get MongoDB client
 * @returns Promise<MongoClient>
 */
export async function getClient(): Promise<MongoClient> {
  return clientPromise;
}

/**
 * Check if MongoDB connection is healthy
 * @returns Promise<boolean>
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const client = await clientPromise;
    await client.db().admin().ping();
    return true;
  } catch (error) {
    console.error("MongoDB connection check failed:", error);
    return false;
  }
}

export default clientPromise;
