import { v4 as uuidv4 } from "uuid";
import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";
import { DateTime, Str, Obj } from "@cloudflare/itty-router-openapi";

export const CSVFormat = {
  data: new Str({ example: "lorem ipsum dolor..." }),
  metadata: new Str({ example: "author: ...\ntitle: ..." }),
};

export const QueryFormat = {
  query: new Str({ example: "lorem ipsum dolor..." }),
};

export const router = OpenAPIRouter({
  docs_url: "/docs",
});

import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
} from "@cloudflare/itty-router-openapi";

export interface Env {
  VECTORIZE_INDEX: VectorizeIndex;
  AI: any;
}
interface EmbeddingResponse {
  shape: number[];
  data: number[][];
}

export class Insert extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ["Insert"],
    summary: "Insert CSV",
    requestBody: [CSVFormat],
    responses: {
      "200": {
        description: "{ success: true, namespace: string }",
        schema: {
          success: Boolean,
          result: {
            task: {},
          },
        },
      },
    },
  };

  async handle(
    request: Request,
    env: any,
    context: any,
    data: Record<string, any>
  ): Promise<Response> {
    // Retrieve the validated request body
    const csvData = data.body;
    const userID = data.user_id;
    if (!userID) {
      return Response.json({ success: false, error: "User ID is required" });
    }
    // map out all the data from the csv
    const dataToInput = csvData.map((row) => row.data);
    const metadata = csvData.map((row) => row.metadata);

    const modelResp: EmbeddingResponse = await env.AI.run(
      "@cf/baai/bge-base-en-v1.5",
      {
        text: dataToInput,
      }
    );

    // Convert the vector embeddings into a format Vectorize can accept.
    // Each vector needs an ID, a value (the vector) and optional metadata.
    // In a real application, your ID would be bound to the ID of the source
    const vectors: VectorizeVector[] = [];
    let id = uuidv4();
    modelResp.data.forEach((vector, idx) => {
      vectors.push({
        id: `${id}`,
        values: vector,
        metadata: {
          text: dataToInput[idx],
          metadata: metadata[idx],
		  namespace: userID,
          createdAt: new Date().toISOString(),
        },
      });
    });

    let inserted = await env.VECTORIZE_INDEX.upsert(vectors);

    try {
      // csv headers: data, metadata
      const createdAt = new Date().toISOString();

      return Response.json({
        success: true,
        namespace: uuidv4(),
        inserted: inserted,
      });
    } catch (err) {
      return Response.json({ success: false, error: err.message });
    }
  }
}

export class Query extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ["Query"],
    summary: "Query",
    requestBody: QueryFormat,
    responses: {
      "200": {
        description: "{ success: true, namespace: string }",
        schema: {
          success: Boolean,
          result: {
            task: {},
          },
        },
      },
    },
  };

  async handle(
    request: Request,
    env: any,
    context: any,
    data: Record<string, any>
  ): Promise<Response> {
    try {
      let userQuery = data.body.query;
      const queryVector: EmbeddingResponse = await env.AI.run(
        "@cf/baai/bge-base-en-v1.5",
        {
          text: [userQuery],
        }
      );

      // 37db67ab-4ec2-4f72-bffc-193e758465a9

      // console.log(queryVector);
      const cv = await env.VECTORIZE_INDEX;
      console.log(cv.query);

      let matches = await env.VECTORIZE_INDEX.query(queryVector.data[0], {
        topK: 3,
        returnMetadata: true,
      });

      return Response.json({
        // Expect a vector ID. 1 to be your top match with a score of
        // ~0.896888444
        // This tutorial uses a cosine distance metric, where the closer to one,
        // the more similar.
        matches: matches,
      });
    } catch (err) {
      return Response.json({ success: false, error: err.message });
    }
  }
}

router.post("/api/insert/", Insert);
router.post("/api/query/", Query);
router.get("/api/generate/", () =>
  Response.json({ success: true, namespace: uuidv4() })
);

// 404 for everything else
router.all("*", () =>
  Response.json(
    {
      success: false,
      error: "Route not found",
    },
    { status: 404 }
  )
);

export default {
  fetch: router.handle,
} satisfies ExportedHandler<Env>;

/*
export {
	async fetch(request, env, ctx): Promise<Response> {
		let path = new URL(request.url).pathname;
		if (path.startsWith('/favicon')) {
			return new Response('', { status: 404 });
		}

		if (path === '/csv-insert') {
			try {
				// csv headers: data, metadata
				const createdAt = new Date().toISOString();
				
				return Response.json({ success: true, namespace: uuidv4() });
			} catch (err) {
				return Response.json({ success: false, error: err.message });
			}
		}

		// You only need to generate vector embeddings once (or as
		// data changes), not on every request
		if (path === '/insert') {
			// In a real-world application, you could read content from R2 or
			// a SQL database (like D1) and pass it to Workers AI
			const stories = ['This is a story about an orange cloud', 'This is a story about a llama', 'This is a story about a hugging emoji'];
			const modelResp: EmbeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
				text: stories,
			});

			// Convert the vector embeddings into a format Vectorize can accept.
			// Each vector needs an ID, a value (the vector) and optional metadata.
			// In a real application, your ID would be bound to the ID of the source
			// document.
			let vectors: VectorizeVector[] = [];
			let id = 1;
			modelResp.data.forEach((vector) => {
				vectors.push({ id: `${id}`, values: vector });
				id++;
			});

			let inserted = await env.VECTORIZE_INDEX.upsert(vectors);
			return Response.json(inserted);
		}

		// Your query: expect this to match vector ID. 1 in this example
		let userQuery = 'orange cloud';
		const queryVector: EmbeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
			text: [userQuery],
		});

		let matches = await env.VECTORIZE_INDEX.query(queryVector.data[0], { topK: 1 });
		return Response.json({
			// Expect a vector ID. 1 to be your top match with a score of
			// ~0.896888444
			// This tutorial uses a cosine distance metric, where the closer to one,
			// the more similar.
			matches: matches,
		});
	},
} satisfies ExportedHandler<Env>;
*/
