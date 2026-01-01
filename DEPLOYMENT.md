# RailGate - Deployment Guide

## 🚀 Quick Deploy to Vercel

### 1. Prerequisites
```bash
- GitHub account
- Vercel account (free tier)
- Rail Radar API key
```

### 2. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit - RailGate Pan-India"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/railgate.git
git push -u origin main
```

### 3. Deploy on Vercel
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Add Environment Variable:
   - **Key**: `VITE_RAILRADAR_API_KEY`
   - **Value**: Your Rail Radar API key
4. Click **Deploy**

### 4. Production URL
```
https://railgate.vercel.app (or your custom domain)
```

---

## 🔧 Alternative: Deploy to Netlify

### Option A: Git-based
1. Go to https://app.netlify.com/start
2. Connect GitHub repo
3. Build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Environment variables → Add `VITE_RAILRADAR_API_KEY`
5. Deploy!

### Option B: Drag & Drop
```bash
npm run build
# Drag the 'dist' folder to Netlify
```

---

## 📦 Build for Production

```bash
# Install dependencies
npm install

# Build
npm run build

# Preview production build
npm run preview
```

**Output**: `dist/` folder ready to deploy

---

## 🌍 Custom Domain Setup

### Vercel
1. Go to Project Settings → Domains
2. Add your domain (e.g., railgate.com)
3. Update DNS records as shown

### Netlify
1. Domain settings → Add custom domain
2. Configure DNS (Netlify DNS or external)

---

## 🔐 Environment Variables

**Required:**
- `VITE_RAILRADAR_API_KEY` - Your Rail Radar API key

**Optional:**
- `VITE_ANALYTICS_ID` - Google Analytics (if added)

---

## 📊 Post-Deployment Checklist

- [ ] Test city search (Mumbai, Delhi, Bangalore)
- [ ] Test station selection
- [ ] Verify gates load from OSM
- [ ] Check mobile responsiveness
- [ ] Test crowdsource voting (3 users)
- [ ] Verify Rail Radar delays work
- [ ] Monitor API usage (should be <1000/month)
- [ ] Setup error tracking (Sentry optional)

---

## 🔄 Continuous Deployment

Both Vercel and Netlify auto-deploy on git push to main branch.

**To update:**
```bash
git add .
git commit -m "Update: feature description"
git push
```

**Live in ~2 minutes!** ✨

---

## 🐛 Troubleshooting

**Build fails:**
- Check `package.json` dependencies
- Verify Node version (16+)

**API key not working:**
- Ensure env variable name is exact: `VITE_RAILRADAR_API_KEY`
- Check Vercel/Netlify environment settings

**No gates showing:**
- Check browser console for errors
- Verify OSM API is accessible
- Clear cache and hard reload

---

## 📈 Monitoring

**Free Tools:**
- **Vercel Analytics** - Built-in traffic stats
- **Google Analytics** - User behavior
- **Sentry** - Error tracking (optional)

---

## 💾 Backup Strategy

**localStorage Data:**
- User stats
- Gate reports
- Delay submissions

**Recommendation**: Add backend (Firebase/Supabase) for data persistence.

---

**Time to Deploy**: ~5 minutes  
**Monthly Cost**: $0 (free tier)  
**Estimated Users**: 1,000-5,000/month (free tier limits)
