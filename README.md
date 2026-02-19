# Navruz CRM - Next.js Application

A modern CRM system built with Next.js, TypeScript, and Tailwind CSS.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Hooks + localStorage
- **Internationalization**: Built-in i18n (UZ/RU)

## Project Structure

```
crm-nextjs/
├── app/                    # Next.js app directory
│   ├── dashboard/         # Dashboard page
│   ├── orders/            # Orders management
│   ├── products/          # Products management
│   ├── crm/               # CRM and tasks
│   ├── login/             # Login page
│   └── layout.tsx         # Root layout
├── components/            # Reusable components
│   ├── Layout.tsx         # Main layout wrapper
│   ├── Topbar.tsx         # Top navigation bar
│   └── Navigation.tsx      # Main navigation
├── lib/                   # Utilities
│   ├── storage.ts         # localStorage utilities
│   └── translations.ts    # i18n translations
├── types/                 # TypeScript types
│   └── index.ts           # Type definitions
└── public/                # Static assets
```

## Getting Started

### Installation

```bash
cd crm-nextjs
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Features

- ✅ Modern React + TypeScript architecture
- ✅ Next.js App Router
- ✅ Tailwind CSS styling
- ✅ Multi-language support (UZ/RU)
- ✅ Authentication system
- ✅ Dashboard with metrics
- ✅ Orders management
- ✅ Products management
- ✅ CRM and task management
- ✅ Responsive design

## Default Credentials

- **Username**: admin
- **Password**: 1234

## Architecture Improvements

1. **Component-based**: Reusable React components
2. **Type-safe**: Full TypeScript coverage
3. **Modern routing**: Next.js App Router
4. **Utility-first CSS**: Tailwind CSS
5. **Centralized state**: localStorage utilities
6. **i18n ready**: Translation system
7. **Scalable structure**: Organized folder hierarchy
