#!/bin/bash
set -e

SRC="$HOME/givebid"
DEST="$HOME/northwoodbids"

echo "🔁 Copying $SRC → $DEST"
cp -r "$SRC" "$DEST"

echo "🗑  Removing old git history"
rm -rf "$DEST/.git"
rm -f "$DEST/.env.local"          # don't carry over PurposeBid secrets
rm -rf "$DEST/node_modules"       # reinstall fresh
rm -f "$DEST/package-lock.json"

echo "✏️  Renaming brand strings"
# macOS-compatible sed (BSD)
find "$DEST" \
  -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.md" -o -name "*.mjs" -o -name "*.env*" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  | while read -r file; do
    sed -i '' \
      -e 's/PurposeBid/Northwood Bids/g' \
      -e 's/purposebid\.com/northwoodbids.com/g' \
      -e 's/purposebid/northwoodbids/g' \
      "$file"
  done

# Fix package.json name
sed -i '' 's/"name": ".*"/"name": "northwoodbids"/' "$DEST/package.json"

# Rename vercel project name if present
sed -i '' 's/"name": "givebid"/"name": "northwoodbids"/' "$DEST/vercel.json" 2>/dev/null || true

echo "📦 Installing dependencies"
cd "$DEST"
npm install

echo "🗃  Initializing new git repo"
git init
git add -A
git commit -m "Initial commit: Northwood Bids (cloned from PurposeBid)"

echo ""
echo "✅ Done! Your new project is at: $DEST"
echo ""
echo "NEXT STEPS — do each of these for Northwood Bids (separate from PurposeBid):"
echo ""
echo "1. GitHub: create a new repo 'northwoodbids' → git remote add origin <url> → git push -u origin main"
echo "2. Vercel: import the new repo, set framework = Next.js"
echo "3. Supabase: create a new project → copy DATABASE_URL + DIRECT_URL"
echo "4. Clerk: create a new application → copy publishable + secret keys"
echo "5. Stripe: use same or new account → copy keys + create webhook"
echo "6. Pusher: create a new Channels app → copy all 4 keys"
echo "7. Create $DEST/.env.local with all vars (see .env.example if present)"
echo "8. cd $DEST && npx prisma db push"
echo "9. git push → Vercel auto-deploys"
