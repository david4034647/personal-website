# Facebook Posts Integration

This project scrapes Facebook posts and displays them on a personal website with media hosted on Qiniu CDN.

## Setup

1. Install dependencies:
```bash
cd personal-website
npm install
```

## Usage

### Step 1: Scrape Facebook Posts

This will open a browser and scroll through your Facebook profile to collect posts from the last 3 years.

```bash
npm run scrape
```

**Note**: Facebook may require login. If prompted, manually log in within the opened browser window, then the scraper will continue.

### Step 2: Download Media Files

Download all images and videos to the `media/` folder:

```bash
npm run download
```

### Step 3: Upload to Qiniu Cloud

Upload all media files to Qiniu CDN:

```bash
npm run upload
```

### Run All Steps at Once

```bash
npm run build-posts
```

## File Structure

```
personal-website/
├── data/
│   └── posts.json          # Scraped posts data
├── media/                  # Downloaded media files
├── scripts/
│   ├── scrape-facebook.js  # Facebook scraping script
│   ├── download-media.js   # Media download script
│   └── upload-to-qiniu.js  # Qiniu upload script
├── index.html              # Main website with posts section
└── package.json
```

## Qiniu Configuration

The upload script is pre-configured with:
- **Bucket**: `gn-rrd`
- **Domain**: `https://img.gnso.cn`
- **Upload Path**: `2026/03/12/david/`

## Viewing Posts

Open `index.html` in a browser or run:

```bash
npm run dev
```

The "动态" section will display posts with:
- Image carousels for multiple photos
- Video playback
- Year-based filtering (2023-2026)
- Lightbox for full-size images
- Lazy loading for performance
