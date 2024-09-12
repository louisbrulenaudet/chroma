import { AdminClient } from "./AdminClient";
import { ChromaClient } from "./ChromaClient";
import { ChromaConnectionError } from "./Errors";
import { IEmbeddingFunction } from "./embeddings/IEmbeddingFunction";
import {
  AddRecordsParams,
  CollectionParams,
  Embeddings,
  Documents,
  Metadata,
  BaseRecordOperationParams,
  MultiRecordOperationParams,
  MultiRecordOperationParamsWithIDsOptional,
  UpdateRecordsParams,
  UpsertRecordsParams,
} from "./types";
import { Collection } from "./Collection";

// a function to convert a non-Array object to an Array
export function toArray<T>(obj: T | T[]): Array<T> {
  if (Array.isArray(obj)) {
    return obj;
  } else {
    return [obj] as T[];
  }
}

// a function to convert an array to array of arrays
export function toArrayOfArrays<T>(
  obj: Array<Array<T>> | Array<T>,
): Array<Array<T>> {
  if (Array.isArray(obj[0])) {
    return obj as Array<Array<T>>;
  } else {
    return [obj] as Array<Array<T>>;
  }
}

/**
 * Dynamically imports a specified module, providing a workaround for browser environments.
 * This function is necessary because we dynamically import optional dependencies
 * which can cause issues with bundlers that detect the import and throw an error
 * on build time when the dependency is not installed.
 * Using this workaround, the dynamic import is only evaluated on runtime
 * where we work with try-catch when importing optional dependencies.
 *
 * @param {string} moduleName - Specifies the module to import.
 * @returns {Promise<any>} Returns a Promise that resolves to the imported module.
 */
export async function importOptionalModule(moduleName: string) {
  return Function(`return import("${moduleName}")`)();
}

export async function validateTenantDatabase(
  adminClient: AdminClient,
  tenant: string,
  database: string,
): Promise<void> {
  try {
    await adminClient.getTenant({ name: tenant });
  } catch (error) {
    if (error instanceof ChromaConnectionError) {
      throw error;
    }
    throw new Error(
      `Could not connect to tenant ${tenant}. Are you sure it exists? Underlying error:
${error}`,
    );
  }

  try {
    await adminClient.getDatabase({ name: database, tenantName: tenant });
  } catch (error) {
    if (error instanceof ChromaConnectionError) {
      throw error;
    }
    throw new Error(
      `Could not connect to database ${database} for tenant ${tenant}. Are you sure it exists? Underlying error:
${error}`,
    );
  }
}

export function isBrowser() {
  return (
    typeof window !== "undefined" && typeof window.document !== "undefined"
  );
}

function arrayifyParams(
  params: BaseRecordOperationParams,
): MultiRecordOperationParamsWithIDsOptional {
  return {
    ids: params.ids !== undefined ? toArray(params.ids) : undefined,
    embeddings: params.embeddings
      ? toArrayOfArrays(params.embeddings)
      : undefined,
    metadatas: params.metadatas
      ? toArray<Metadata>(params.metadatas)
      : undefined,
    documents: params.documents ? toArray(params.documents) : undefined,
  };
}

export async function prepareRecordRequestForUpsert(
  reqParams: UpsertRecordsParams | UpdateRecordsParams,
  embeddingFunction: IEmbeddingFunction,
): Promise<MultiRecordOperationParams> {
  const recordSet = arrayifyParams(reqParams);
  const { ids, embeddings, documents } = recordSet;

  if (!ids) {
    throw new Error("ids cannot be undefined");
  }

  if (!embeddings && !documents) {
    throw new Error("embeddings and documents cannot both be undefined");
  }

  validateIDs(ids);

  recordSet.embeddings = await computeEmbeddings(
    embeddingFunction,
    embeddings,
    documents,
  );

  return recordSet as MultiRecordOperationParams;
}

export async function prepareRecordRequestForUpdate(
  reqParams: UpsertRecordsParams | UpdateRecordsParams,
  embeddingFunction: IEmbeddingFunction,
): Promise<MultiRecordOperationParams> {
  const recordSet = arrayifyParams(reqParams);
  const { ids, embeddings, documents } = recordSet;

  if (!ids) {
    throw new Error("ids cannot be undefined");
  }

  validateIDs(ids);

  if (documents) {
    recordSet.embeddings = await computeEmbeddings(
      embeddingFunction,
      embeddings,
      documents,
    );
  }

  return recordSet as MultiRecordOperationParams;
}

export async function prepareRecordRequestWithIDsOptional(
  reqParams: AddRecordsParams,
  embeddingFunction: IEmbeddingFunction,
): Promise<MultiRecordOperationParamsWithIDsOptional> {
  const recordSet = arrayifyParams(reqParams);
  const { ids, embeddings, documents } = recordSet;

  if (!embeddings && !documents) {
    throw new Error("embeddings and documents cannot both be undefined");
  }

  if (ids !== undefined) {
    validateIDs(ids);
  }

  recordSet.embeddings = await computeEmbeddings(
    embeddingFunction,
    embeddings,
    documents,
  );

  return recordSet;
}

async function computeEmbeddings(
  embeddingFunction: IEmbeddingFunction,
  embeddings?: Embeddings,
  documents?: Documents,
): Promise<Embeddings | undefined> {
  if (embeddings) {
    return embeddings;
  }

  let embeddingsArray: Embeddings | undefined;
  if (documents) {
    embeddingsArray = await embeddingFunction.generate(documents);
  }

  if (!embeddingsArray) {
    throw new Error("Failed to generate embeddings for your request.");
  }

  return embeddingsArray;
}

function validateIDs(ids: string[]) {
  for (let i = 0; i < ids.length; i += 1) {
    if (typeof ids[i] !== "string") {
      throw new Error(
        `Expected ids to be strings, found ${typeof ids[i]} at index ${i}`,
      );
    }
  }

  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    const duplicateIds = ids.filter(
      (item, index) => ids.indexOf(item) !== index,
    );
    throw new Error(
      `ID's must be unique, found duplicates for: ${duplicateIds}`,
    );
  }
}

export function wrapCollection(
  api: ChromaClient,
  collection: CollectionParams,
): Collection {
  return new Collection(
    collection.name,
    collection.id,
    api,
    collection.embeddingFunction,
    collection.metadata,
  );
}
