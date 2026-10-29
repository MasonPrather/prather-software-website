import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
const text = z.string().trim().min(1);
const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    title: text,
    category: z.enum([
      'Academic research',
      'Prior professional experience',
      'Independent project',
      'Prather Software client engagement',
    ]),
    summary: text.max(240),
    role: text,
    technologies: z.array(text).min(1),
    outcome: text,
    published: z.boolean().default(false),
    order: z.number().int().default(100),
  }),
});
const productSchema = z
  .object({
    title: text,
    summary: text.max(240),
    status: z.enum(['In development', 'Coming soon', 'Released']),
    platforms: z.array(text).min(1),
    price: text.optional(),
    storeUrl: z
      .url()
      .refine(
        (value) => value.startsWith('https://'),
        'Public product links must use HTTPS.',
      )
      .optional(),
    cover: z.string().startsWith('/').optional(),
    published: z.boolean().default(false),
    order: z.number().int().default(100),
  })
  .superRefine((product, context) => {
    if (product.status === 'Released' && !product.storeUrl)
      context.addIssue({
        code: 'custom',
        message: 'Released products require a verified HTTPS store URL.',
        path: ['storeUrl'],
      });
    if (product.status === 'Released' && !product.price)
      context.addIssue({
        code: 'custom',
        message:
          'Released products require verified pricing, including Free where applicable.',
        path: ['price'],
      });
  });
const software = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/software' }),
  schema: productSchema,
});
const games = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/games' }),
  schema: productSchema,
});
export const collections = { work, software, games };
