# Next.js Framework Guidelines

Patterns for Next.js applications. Complements the main typescript-workflow skill.

## App Router

App Router MUST be used for all new Next.js projects.

### Directory Structure

```
app/
├── layout.tsx          # Root layout (REQUIRED)
├── page.tsx            # Home page
├── loading.tsx         # Loading UI
├── error.tsx           # Error boundary
├── not-found.tsx       # 404 page
├── (group)/            # Route groups (no URL segment)
│   └── page.tsx
├── api/                # API routes
│   └── route.ts
└── [slug]/             # Dynamic routes
    └── page.tsx
```

### Special Files

| File | Purpose |
|------|---------|
| `layout.tsx` | Shared UI for segment and children |
| `page.tsx` | Unique UI for route |
| `loading.tsx` | Loading UI with Suspense |
| `error.tsx` | Error boundary |
| `not-found.tsx` | 404 UI |
| `route.ts` | API endpoint |

### Dynamic Routes

```
app/
├── blog/
│   ├── [slug]/page.tsx        # /blog/:slug
│   └── [...slug]/page.tsx     # /blog/* (catch-all)
├── shop/
│   └── [[...slug]]/page.tsx   # /shop or /shop/* (optional catch-all)
```

## Server Components

Server Components are the DEFAULT. Client Components MUST be marked with `'use client'`.

**Server Components for:**
- Data fetching
- Backend resources
- Sensitive data (tokens, API keys)
- Large dependencies

**Client Components for:**
- Interactivity (onClick, onChange)
- React hooks (useState, useEffect)
- Browser-only APIs

```tsx
'use client'
import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

## Server Actions

Server Actions MUST be used for form handling and mutations.

```tsx
// Inline action
export default function Page() {
  async function createItem(formData: FormData) {
    'use server'
    const name = formData.get('name')
    revalidatePath('/')
  }

  return (
    <form action={createItem}>
      <input name="name" />
      <button type="submit">Create</button>
    </form>
  )
}

// Separate file
// app/actions.ts
'use server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createItem(formData: FormData) {
  // Database operation
  revalidatePath('/items')
  redirect('/items')
}
```

## Data Fetching

### Caching Options

```tsx
// Default: cached indefinitely (static)
fetch('https://api.example.com/data')

// Revalidate every 60 seconds
fetch('https://api.example.com/data', { next: { revalidate: 60 } })

// No caching (dynamic)
fetch('https://api.example.com/data', { cache: 'no-store' })

// Revalidate on-demand with tags
fetch('https://api.example.com/data', { next: { tags: ['posts'] } })
```

### On-Demand Revalidation

```ts
'use server'
import { revalidatePath, revalidateTag } from 'next/cache'

export async function updatePost() {
  revalidateTag('posts')
  revalidatePath('/blog')
}
```

## Image Optimization

`next/image` MUST be used for all images.

```tsx
import Image from 'next/image'

<Image
  src="/hero.jpg"
  alt="Hero image"
  fill
  sizes="(max-width: 768px) 100vw, 50vw"
  style={{ objectFit: 'cover' }}
  priority  // For LCP images
/>
```

Remote domains MUST be configured:

```ts
// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.example.com', pathname: '/images/**' },
    ],
  },
}
```

## Metadata API

```tsx
// Static
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page Title',
  description: 'Page description',
  openGraph: { title: 'OG Title', images: ['/og-image.jpg'] },
}

// Dynamic
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  return { title: post.title, description: post.excerpt }
}

// Template (layout.tsx)
export const metadata: Metadata = {
  title: { template: '%s | My Site', default: 'My Site' },
}
```

## Middleware

Middleware MUST be at `middleware.ts` in project root.

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')

  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
```

## Environment Variables

| Prefix | Availability |
|--------|--------------|
| None | Server only |
| `NEXT_PUBLIC_` | Client + Server |

Validate at build time:

```ts
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
})

export const env = envSchema.parse(process.env)
```

## Common Patterns

### Error Handling

```tsx
// app/dashboard/error.tsx
'use client'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

### Not Found

```tsx
import { notFound } from 'next/navigation'

async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getItem(id)

  if (!item) notFound()

  return <div>{item.name}</div>
}
```
