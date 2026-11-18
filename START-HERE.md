# Heart Social — fresh deployment package

This package retains the shared workspace, individual logins, Owner/Admin/Editor/Viewer roles, and account assignments.

## Upload and deploy

1. Extract this ZIP to a new folder. The ZIP contains package.json and vercel.json directly at its root.
2. Copy ALL extracted files and folders into a new private GitHub repository. Use GitHub Desktop if browser folder uploads fail. Do not upload the ZIP itself.
3. Import that repository into Vercel. Root Directory: repository root. Framework: Next.js.
4. Leave Output Directory override OFF. The included vercel.json selects Next.js, uses npm ci and npm run build, and resets the output override to the framework default.
5. Deploy. Without cloud configuration, the application opens in local planning mode.
6. Follow README.md “Fresh Vercel setup” to create the database, configure environment variables, and create your first Owner. Multi-user login requires that setup.

## Replacing an existing deployment

Replace the old application source with these files. Remove the legacy app/api/[...route] folder if present; do not merge it into these explicit API routes. Keep credentials in Vercel, not in GitHub.

If your existing Vercel project has Root Directory set to heart-social, clear it when uploading this package's files directly at repository root. Save the settings and redeploy the latest commit.

For an existing older database, use migrations/002-team-access.sql as described in README.md. Back up your database before migration.

## Included and excluded

Source code, dependency lockfile, database schema/migration, tests, environment template, and deployment configuration are included. Dependencies and generated build output are installed/built by Vercel; they are not uploaded.

Social account credentials, database/storage services, and a recurring scheduler still need your configuration. This ZIP does not connect accounts or publish posts automatically.
