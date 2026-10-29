import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
const work = defineCollection({ loader: glob({pattern:'**/*.md',base:'./src/content/work'}), schema:z.object({title:z.string(),category:z.enum(['Academic research','Prior professional experience','Independent project','Prather Software client engagement']),summary:z.string(),role:z.string(),technologies:z.array(z.string()),outcome:z.string(),published:z.boolean().default(false)}) });
const productSchema=z.object({title:z.string(),summary:z.string(),status:z.enum(['In development','Coming soon','Released']),platforms:z.array(z.string()),price:z.string().optional(),storeUrl:z.string().url().optional(),cover:z.string().optional(),published:z.boolean().default(false)});
const software=defineCollection({loader:glob({pattern:'**/*.md',base:'./src/content/software'}),schema:productSchema});
const games=defineCollection({loader:glob({pattern:'**/*.md',base:'./src/content/games'}),schema:productSchema});
export const collections={work,software,games};
