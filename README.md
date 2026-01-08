# OpportunityDash

A comprehensive opportunity management dashboard for tracking tenders, bids, and business opportunities with real-time data synchronization from Google Sheets.

## Features

### 📊 Dashboard & Analytics
- **Real-time KPI Cards**: Track active opportunities, pipeline value, won/lost deals
- **Interactive Funnel Chart**: Visualize opportunity progression through stages
- **Client Leaderboard**: Monitor top clients by opportunity value
- **At-Risk Widget**: Identify opportunities needing immediate attention
- **Advanced Filtering**: Filter by status, lead, client, group, and risk factors
- **Data Health Monitoring**: Track data completeness and quality

### 🔄 Google Sheets Integration
- **Direct API Integration**: Connect to Google Sheets without backend
- **Auto-Refresh**: Configurable automatic data synchronization (default: 2 hours)
- **Smart Column Detection**: Automatically detects headers from any row
- **Flexible Mapping**: Supports various column naming conventions
- **Real-time Sync**: Manual refresh button for instant updates
- **Debug Mode**: Built-in debugging tools for troubleshooting connections

### 💱 Currency Management
- **Multi-Currency Support**: Switch between USD and AED (UAE Dirham)
- **Configurable Exchange Rate**: Set custom rates or use default (1 USD = 3.67 AED)
- **Auto-Conversion**: All values automatically converted to selected currency
- **Persistent Settings**: Exchange rate saved across sessions

### 📈 Opportunity Management
- **Comprehensive Tracking**: Monitor opportunities from pre-bid to award
- **Risk Assessment**: Automatic identification of at-risk opportunities
- **Aging Analysis**: Track days since last contact and tender receipt
- **Probability Scoring**: Win probability by stage with manual override
- **Expected Value Calculation**: Weighted pipeline based on probability
- **Partner Tracking**: Monitor partner involvement and collaboration

### 🎨 User Experience
- **Dark/Light Mode**: Toggle between themes
- **Responsive Design**: Optimized for desktop and mobile
- **Advanced Filters**: Multi-dimensional filtering capabilities
- **Export Functionality**: Export filtered data to Excel
- **Detailed Views**: Slide-out panels with complete opportunity details
- **Connection Status**: Visual indicators for sync status

## Tech Stack

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **State Management**: React Context API
- **Data Visualization**: Recharts
- **Forms**: React Hook Form with Zod validation
- **Date Handling**: date-fns
- **Notifications**: Sonner (toast notifications)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Google Cloud account (for Sheets API)
- Google Sheets with opportunity data

### Installation
```bash
# Clone the repository
git clone https://github.com/Arjunsk1291/opportunityDash.git

# Navigate to project directory
cd opportunityDash

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Google Sheets Setup

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project
   - Enable Google Sheets API

2. **Generate API Key**
   - Navigate to Credentials
   - Create Credentials → API Key
   - Copy the API key

3. **Prepare Your Google Sheet**
   - Make your sheet public: Share → Anyone with the link can view
   - Ensure first row contains column headers
   - Supported columns:
     - Opportunity Ref No
     - Tender Name
     - Client Name
     - Opportunity Status
     - Internal Lead
     - Opportunity Value
     - Probability
     - Date Tender Received
     - Planned Submission Date
     - And more...

4. **Configure in OpportunityDash**
   - Navigate to Admin page (`/admin`)
   - Enter your API Key
   - Enter Spreadsheet ID (from URL)
   - Enter Sheet Name (tab name)
   - Click "Test & Debug" to verify
   - Click "Save & Sync" to start syncing

## Project Structure
```
opportunityDash/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── Dashboard/    # Dashboard-specific components
│   │   ├── ui/           # shadcn/ui components
│   │   └── ...
│   ├── contexts/         # React Context providers
│   │   ├── AuthContext.tsx
│   │   ├── DataContext.tsx
│   │   ├── CurrencyContext.tsx
│   │   └── ApprovalContext.tsx
│   ├── data/             # Data utilities and mock data
│   │   └── opportunityData.ts
│   ├── hooks/            # Custom React hooks
│   │   ├── useAutoRefresh.ts
│   │   └── use-toast.ts
│   ├── pages/            # Page components
│   │   ├── Dashboard.tsx
│   │   ├── Opportunities.tsx
│   │   ├── Analytics.tsx
│   │   ├── Admin.tsx
│   │   └── ...
│   ├── services/         # External service integrations
│   │   └── googleSheetsService.ts
│   └── lib/              # Utility functions
├── public/               # Static assets
└── package.json
```

## Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory (optional):
```env
# Not required - API key can be configured in UI
VITE_GOOGLE_SHEETS_API_KEY=your_api_key_here
```

### Auto-Refresh Interval

Modify the refresh interval in any page component:
```typescript
// Default: 120 minutes (2 hours)
useAutoRefresh(120);

// Change to 30 minutes
useAutoRefresh(30);
```

### Exchange Rate

Default: 1 USD = 3.67 AED (UAE Dirham peg)

Customize via Currency Settings in the header or programmatically:
```typescript
const { setExchangeRate } = useCurrency();
setExchangeRate(3.68); // Set custom rate
```

## Data Structure

### Opportunity Interface
```typescript
interface Opportunity {
  id: string;
  opportunityRefNo: string;
  tenderName: string;
  clientName: string;
  opportunityStatus: string;
  canonicalStage: string;
  groupClassification: string;
  internalLead: string;
  opportunityValue: number;
  probability: number;
  expectedValue: number;
  dateTenderReceived: string | null;
  tenderPlannedSubmissionDate: string | null;
  isAtRisk: boolean;
  // ... and more fields
}
```

## Deployment

### Static Hosting (Recommended)

This is a pure frontend application and can be deployed to any static hosting service:

**Netlify:**
```bash
npm run build
# Deploy dist/ folder
```

**Vercel:**
```bash
npm run build
# Deploy dist/ folder
```

**GitHub Pages:**
```bash
npm run build
# Deploy dist/ folder to gh-pages branch
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and proprietary.

## Support

For issues and questions:
- Create an issue in the GitHub repository
- Contact the development team

## Roadmap

### Upcoming Features
- [ ] Backend API for enhanced security and caching
- [ ] Visual column mapping interface
- [ ] Configurable probability rules engine
- [ ] User authentication and permissions
- [ ] Real-time webhook support for instant updates
- [ ] Historical data tracking and trends
- [ ] Advanced analytics and reporting
- [ ] Email notifications for at-risk opportunities
- [ ] Mobile app (React Native)

## Acknowledgments

- Built with [React](https://reactjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- Charts powered by [Recharts](https://recharts.org/)
