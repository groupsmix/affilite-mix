const fs = require('fs');

let deploy = fs.readFileSync('/data/user/work/affilite-mix/.github/workflows/deploy.yml', 'utf8');

deploy = deploy.replace(
  '          echo "STRIPE_WEBHOOK_SECRET=${{ secrets.STRIPE_WEBHOOK_SECRET }}" >> .dev.vars\n          echo "CLERK_SECRET_KEY=${{ secrets.CLERK_SECRET_KEY }}" >> .dev.vars',
  '          echo "STRIPE_WEBHOOK_SECRET=${{ secrets.STRIPE_WEBHOOK_SECRET }}" >> .dev.vars\n          echo "CLERK_SECRET_KEY=${{ secrets.CLERK_SECRET_KEY }}" >> .dev.vars\n          echo "CLOUDFLARE_ACCOUNT_ID=${{ secrets.CLOUDFLARE_ACCOUNT_ID }}" >> .dev.vars'
);

deploy = deploy.replace(
  '          echo "STRIPE_WEBHOOK_SECRET=${{ secrets.STRIPE_WEBHOOK_SECRET }}" >> worker_secrets.txt\n          echo "CLERK_SECRET_KEY=${{ secrets.CLERK_SECRET_KEY }}" >> worker_secrets.txt',
  '          echo "STRIPE_WEBHOOK_SECRET=${{ secrets.STRIPE_WEBHOOK_SECRET }}" >> worker_secrets.txt\n          echo "CLERK_SECRET_KEY=${{ secrets.CLERK_SECRET_KEY }}" >> worker_secrets.txt\n          echo "CLOUDFLARE_ACCOUNT_ID=${{ secrets.CLOUDFLARE_ACCOUNT_ID }}" >> worker_secrets.txt'
);

fs.writeFileSync('/data/user/work/affilite-mix/.github/workflows/deploy.yml', deploy);

