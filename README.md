# 🎯 @vite-plugin-resolve-barrels

A Vite plugin that optimizes imports through barrel files (index.ts files) by resolving them to direct imports from specific modules instead of going through re-exports.

## 📚 Table of Contents

- [🚀 Problem It Solves](#-problem-it-solves)
- [📦 Installation](#-installation)
- [⚙️ Usage](#️-usage)
- [⚙️ Configuration Options](#️-configuration-options)
- [⚠️ Important Recommendations](#️-important-recommendations)
- [💡 Usage Examples](#-usage-examples)
- [📊 Optimization Results](#-optimization-results)
- [🐛 Logging and Debugging](#-logging-and-debugging)
- [🔧 Technical Details](#-technical-details)
- [🚀 Development and Testing](#-development-and-testing)

## 🚀 Problem It Solves

### 📦 Barrel Files and Performance Issues

Barrel files (index.ts files) are a popular pattern for creating convenient APIs for module exports:

```typescript
// src/widgets/index.ts (barrel file)
export { CreateShopLayout } from './authentication/createShopLayout';
export { ProductList } from './products/productList';
export { ShoppingCart } from './cart/shoppingCart';
// ... dozens of other exports
```

However, using barrel files creates serious performance problems:

> 🌳 **Tree-shaking doesn't work effectively** - bundlers can't determine which modules are actually used  
> 📦 **Excessive code in bundle** - entire barrel file is imported even for a single component  
> 🔥 **HMR breaks or works poorly** - changing one file forces reloading the entire barrel  
> 📈 **Increased bundle size** - especially critical for production builds

### 🔄 Problem Example

**❌ Instead of this (inefficient):**

```typescript
import { CreateShopLayout, ProductList } from 'widgets';
// ⚠️  Imports entire barrel file with all dependencies
```

**✅ Plugin automatically transforms to (optimized):**

```typescript
import { CreateShopLayout } from './widgets/authentication/createShopLayout';
import { ProductList } from './widgets/products/productList';
// 🎯 Direct imports of only needed modules
```

## 📦 Installation

```bash
npm install -D vite-plugin-resolve-barrels
```

## ⚙️ Usage

### 🚀 Basic Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { resolveBarrelsPlugin } from 'vite-plugin-resolve-barrels';

export default defineConfig({
  plugins: [
    resolveBarrelsPlugin({
      directories: ['widgets', 'features', 'entities', 'shared'],
    }),
  ],
});
```

### 🛠️ Full Configuration with Options

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { resolveBarrelsPlugin } from 'vite-plugin-resolve-barrels';

export default defineConfig({
  plugins: [
    resolveBarrelsPlugin({
      directories: ['widgets', 'features', 'entities', 'shared'],
      enable: process.env.NODE_ENV === 'production', // Only for production
      logReplacements: true, // Console logging
      logToFile: true, // Save logs to file
      logFilePath: 'barrel-resolutions.log',
      alias: { '@': 'src' }, // Path aliases support
      barrelFiles: ['index.ts', 'api.ts', 'models.ts'], // Custom barrel file names
      rootDir: 'src', // Root directory to scan (default: 'src')
      preserveExtensions: false, // Keep file extensions in imports (default: false)
    }),
  ],
});
```

## ⚙️ Configuration Options

| Option                  | Type                          | Default                                         | Description                                                |
| ----------------------- | ----------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| 📁 `directories`        | `string[]`                    | **required**                                    | List of directories to process barrel files                |
| 🔧 `enable`             | `boolean`                     | `true`                                          | Enable/disable the plugin                                  |
| 🖥️ `logReplacements`    | `boolean`                     | `false`                                         | Output replacement logs to console                         |
| 📄 `logToFile`          | `boolean`                     | `false`                                         | Save logs to file                                          |
| 📍 `logFilePath`        | `string`                      | `''`                                            | Path to log file                                           |
| 🔗 `alias`              | `Record<string, string>`      | `{}`                                            | Path aliases configuration (e.g., `{ '@': 'src' }`)        |
| 📦 `barrelFiles`        | `string[]`                    | `['index.ts', 'index.tsx', 'index.js', 'index.jsx']` | Barrel file names to recognize                    |
| 📂 `rootDir`            | `string \| string[]`          | `'src'`                                         | Root directory(ies) to scan for barrel files               |
| 🔤 `preserveExtensions` | `boolean`                     | `false`                                         | Keep file extensions in resolved imports                   |

## ⚠️ Important Recommendations

### 🚀 Use Only for Production Builds

**NOT recommended** for development mode due to:

- Additional computations on every code change
- Debugging complexity
- HMR may not work properly or at all

```typescript
// Recommended configuration
resolveBarrelsPlugin({
  directories: ['widgets', 'features'],
  enable: process.env.NODE_ENV === 'production', // 👈 Only for production
});
```

### 🚫 When NOT to Use

> 🏠 **Small projects** - if your bundle is small, optimization may not provide significant benefits  
> 🔧 **Development server** - may slow down module reloading  
> 📁 **Projects without barrel files** - plugin won't provide any benefits

## 💡 Usage Examples

```typescript
// vite.config.ts
resolveBarrelsPlugin({
  directories: ['app', 'pages', 'widgets', 'features', 'entities', 'shared'],
  enable: process.env.NODE_ENV === 'production',
});
```

### 🔗 Using Path Aliases

The plugin supports path aliases, allowing you to use imports like `@/widgets` instead of `widgets`:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { resolveBarrelsPlugin } from 'vite-plugin-resolve-barrels';

export default defineConfig({
  plugins: [
    resolveBarrelsPlugin({
      directories: ['widgets', 'features'],
      alias: {
        '@': 'src',                      // @/widgets -> src/widgets
        '~': 'src',                      // ~/features -> src/features
        '@widgets': 'src/widgets',       // @widgets -> src/widgets
        '@app': 'src/app',              // @app -> src/app
      },
    }),
  ],
});
```

**Example usage with aliases:**

```typescript
// Works with aliases ✅
import { Component } from '@/widgets';
import { Feature } from '~/features';
import { Widget } from '@widgets';

// Also works without aliases ✅
import { Component } from 'widgets';
```

**Notes:**
- Aliases are matched by longest prefix first (e.g., `@app` matches before `@`)
- The plugin automatically strips the configured `rootDir` prefix from alias paths
- Both aliased and non-aliased imports work simultaneously

### 📦 Custom Barrel Files (openapi-generator, etc.)

By default, the plugin recognizes only `index.ts|tsx|js|jsx` as barrel files. If your project uses other barrel file names (like `api.ts`, `models.ts` from openapi-generator), configure the `barrelFiles` option:

```typescript
// vite.config.ts
resolveBarrelsPlugin({
  directories: ['api'],
  barrelFiles: ['index.ts', 'api.ts', 'models.ts'], // Recognize multiple barrel patterns
});
```

**Example with openapi-generator:**

```typescript
// Your barrel files:
// src/api/index.ts   - main exports
// src/api/api.ts     - API client exports
// src/api/models.ts  - TypeScript interfaces/models

// Both work now ✅
import { UserApi, ProductApi } from 'api';
import { User, Product } from 'api';
```

The plugin tries barrel files in order until it finds a match.

### 📂 Custom Root Directories

By default, the plugin scans the `src/` directory. You can customize this with the `rootDir` option:

```typescript
// Single custom root
resolveBarrelsPlugin({
  directories: ['components', 'utils'],
  rootDir: 'lib', // Scan lib/ instead of src/
});

// Multiple roots (monorepo/complex projects)
resolveBarrelsPlugin({
  directories: ['widgets', 'features', 'utils'],
  rootDir: ['src', 'lib', 'packages'], // Try each root in order
});
```

**Use cases:**
- Libraries with `lib/` directory
- Monorepos with multiple package roots
- Projects with `components/`, `utils/`, etc. at root level

### 🔤 Preserve File Extensions

By default, the plugin strips `.ts|tsx|js|jsx` extensions from imports. If you need to keep them (e.g., for ESM compatibility), use `preserveExtensions`:

```typescript
resolveBarrelsPlugin({
  directories: ['widgets'],
  preserveExtensions: true,
});
```

**Result:**

```typescript
// With preserveExtensions: false (default)
import { Component } from './widgets/component';

// With preserveExtensions: true
import { Component } from './widgets/component.ts';
```

### 🎯 Real-World Example: OpenAPI Generator

Common scenario with [openapi-generator](https://openapi-generator.tech/):

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    resolveBarrelsPlugin({
      directories: ['api'], 
      barrelFiles: ['index.ts', 'api.ts', 'models.ts'], // All openapi-generator barrels
      alias: { '@api': 'src/api' },
      enable: process.env.NODE_ENV === 'production',
    }),
  ],
});
```

```typescript
// Your imports work seamlessly ✅
import { DefaultApi, UsersApi } from '@api/api';
import { User, Product, Order } from '@api/models';
```

## 📊 Optimization Results

### ❌ Before optimization:

```typescript
// main.tsx
import { CreateShopLayout, ProductCard, useAuth } from 'widgets';
```

> 📦 **Bundle Size:** ~150kb  
> 🚨 **Issues:** Entire widgets/index.ts + all barrel dependencies

### ✅ After optimization:

```typescript
// Automatically transforms to:
import { CreateShopLayout } from './widgets/authentication/createShopLayout';
import { ProductCard } from './widgets/products/productCard';
import { useAuth } from './widgets/auth/useAuth';
```

> 📦 **Bundle Size:** ~45kb (**70% reduction**)  
> 🎯 **Result:** Only specific files + direct dependencies

## 🐛 Logging and Debugging

### 🖥️ Console Logs

```typescript
resolveBarrelsPlugin({
  directories: ['widgets'],
  logReplacements: true, // Enable console logs
});

// Output:
// [resolve-barrels] src/pages/main.tsx:
// original: import { CreateShopLayout } from 'widgets';
// transform: import { CreateShopLayout } from './widgets/authentication/createShopLayout';
```

### 📄 File Logs

```typescript
resolveBarrelsPlugin({
  directories: ['widgets'],
  logToFile: true,
  logFilePath: './build-logs/barrel-resolutions.log',
});
```

## 🔧 Technical Details

### ⚙️ How the Plugin Works

> 1️⃣ **Barrel files analysis** - scans index.ts files in specified directories  
> 2️⃣ **Export maps building** - creates a map of what is exported from where  
> 3️⃣ **AST transformation** - analyzes imports through TypeScript AST  
> 4️⃣ **Import replacement** - replaces barrel imports with direct imports

### 📥 Supported Import Forms

```typescript
// ✅ Supported
import { Component } from 'widgets';
import { Component as MyComponent } from 'widgets/auth';
import { Component1, Component2 } from 'features/auth';

// ❌ Not supported (yet)
import * as widgets from 'widgets';
import widgets from 'widgets';
```

### ⚛️ Framework Support

> **React Only** - This plugin is specifically designed and tested for React projects  
> Supports: `.ts` • `.tsx` • `.js` • `.jsx` files

## 🚀 Development and Testing

```bash
# 📦 Install dependencies
npm install

# 🧪 Run tests
npm run test

# 📊 Tests with coverage
npm run test:coverage

# 🔨 Build package
npm run build

# 🔍 Linting
npm run lint:js
```

---

<div align="center">

**Made with ❤️ for optimizing Vite projects**

🚀 _Faster builds • 📦 Smaller bundles • 🎯 Better performance_

</div>
