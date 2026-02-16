# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/ddf52303-4dfe-45e8-83ec-257fc27fd175

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/ddf52303-4dfe-45e8-83ec-257fc27fd175) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/ddf52303-4dfe-45e8-83ec-257fc27fd175) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Microsoft Graph Excel Sync Configuration

Backend now supports syncing opportunities from a SharePoint/OneDrive Excel file via Microsoft Graph.

### Required backend environment variables

Set these variables in your backend environment (`backend/.env` for local, deployment secrets in production):

- `GRAPH_TENANT_ID`
- `GRAPH_CLIENT_ID`
- `GRAPH_CLIENT_SECRET`

> Keep these values server-side only. Do not expose them in frontend code or browser storage.

### Admin setup flow

1. Login as **Master** user.
2. Open **Master Panel → Data Sync**.
3. Paste your Excel **Share Link** and click **Resolve**.
4. Confirm/adjust `Drive ID` and `File ID`.
5. Click **Refresh Sheets** and choose a worksheet.
6. Set **Data Range** (default `B4:Z2000`) if your headers/data start below row 1.
7. Click **Preview Rows** and select the correct header row offset.
8. Optionally provide custom field mapping JSON.
9. Click **Save Graph Config**.
10. Click **Sync from Graph Excel** to load data into MongoDB.

Auto-sync uses the same Graph configuration.


### One-time delegated token bootstrap (your account)

If your tenant permissions require a user-bound token, you can bootstrap and store a refresh token from **Master Panel → Data Sync**:

1. Enter your Microsoft username/password in **Graph Account Bootstrap (one-time)**.
2. Click **Authenticate & Store Token**.
3. Once stored, Graph calls use your delegated token automatically (with refresh).

If bootstrap is not configured, backend falls back to application token (`client_credentials`).
