#!/usr/bin/env bash
# §0.13 — provision the backend Duxo cannot run without.
#
# Everything here is something only the project owner can do, because every
# step authenticates as *you*: the Firebase and Railway CLIs open a browser and
# use your account. Nothing in this repo holds a credential that can do any of
# it, which is why these steps have stayed undone.
#
# Run the steps you want, in order. Each is independent, prints what it is
# about to do, and stops on the first failure rather than continuing against a
# half-built backend:
#
#   ./scripts/provision.sh firebase   # RTDB + Firestore            (gate 01)
#   ./scripts/provision.sh rules      # deploy the security rules   (gate 02)
#   ./scripts/provision.sh railway    # generate a public domain    (gate 03)
#   ./scripts/provision.sh check      # verify what is done so far
#
# NOT automated, because neither CLI can do it:
#   - Enabling Email/Password auth. There is no CLI for it; the link is printed.
#   - Setting the GitHub secret and repository variables. Links are printed.
#
# The CLIs are invoked with `npx`, so nothing is installed globally. Every
# command and flag below was checked against `--help` on the current
# firebase-tools and @railway/cli before being written down.
set -euo pipefail

PROJECT_ID="${DUXO_FIREBASE_PROJECT_ID:-duxo-967f0}"
RAILWAY_PROJECT="cb502db9-7a51-4645-aac0-e64eea64499f"
RAILWAY_SERVICE="896c1a71-e072-40c1-b2cd-d4ae38a39a65"
FIREBASE_CONSOLE="https://console.firebase.google.com/project/${PROJECT_ID}"

# RTDB region. us-central1 is what the README specifies, and it is the region
# whose default instance is reachable at <project>-default-rtdb.firebaseio.com
# — the host that lib/firebase-client.ts derives when
# NEXT_PUBLIC_FIREBASE_DATABASE_URL is unset. Changing this means setting that
# variable explicitly, or every client will look for the database in the wrong
# place.
RTDB_REGION="us-central1"

# Firestore location. nam5 is the US multi-region; it is permanent once set,
# which is the one genuinely irreversible decision in this script.
FIRESTORE_LOCATION="nam5"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
step()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn()  { printf '\033[33m!! %s\033[0m\n' "$*"; }
manual(){ printf '\033[36m-> do this yourself: %s\033[0m\n' "$*"; }

fb()      { npx -y firebase-tools@latest "$@"; }
railway() { npx -y @railway/cli@latest "$@"; }

confirm() {
    printf '\n%s [y/N] ' "$1"
    read -r reply
    case "$reply" in [yY]*) return 0 ;; *) echo "skipped."; return 1 ;; esac
}

provision_firebase() {
    step "Firebase — Realtime Database and Firestore for ${PROJECT_ID}"
    cat <<TXT
This creates two databases in LOCKED mode (no client can read or write until
the rules are deployed by the 'rules' step). Both are on the Spark free tier.

  Realtime Database  default instance in ${RTDB_REGION}
  Cloud Firestore    (default) in ${FIRESTORE_LOCATION}  <- location is PERMANENT

A browser window will open for you to sign in.
TXT
    confirm "Create them?" || return 0

    fb login

    step "Creating the Realtime Database instance"
    # The default instance is named after the project. If it already exists the
    # CLI errors, which is not a failure worth stopping for — re-running this
    # script after a partial run should be safe.
    if fb database:instances:create "${PROJECT_ID}-default-rtdb" \
        --project "$PROJECT_ID" --location "$RTDB_REGION"; then
        bold "Realtime Database created."
    else
        warn "Could not create the RTDB instance. If it already exists, that is fine —"
        warn "the 'check' step below will tell you. Otherwise create it by hand:"
        manual "${FIREBASE_CONSOLE}/database"
    fi

    step "Creating the Firestore database"
    if fb firestore:databases:create "(default)" \
        --project "$PROJECT_ID" --location "$FIRESTORE_LOCATION"; then
        bold "Firestore created."
    else
        warn "Could not create Firestore. Older firebase-tools spell this command"
        warn "differently, and the location cannot be changed once set, so this one"
        warn "is worth doing in the console if the CLI refused:"
        manual "${FIREBASE_CONSOLE}/firestore"
    fi

    step "Authentication — this one has no CLI"
    warn "Enabling Email/Password cannot be scripted. Device pairing mints a custom"
    warn "token server-side (which works) and the host then exchanges it via"
    warn "signInWithCustomToken — that half fails with CONFIGURATION_NOT_FOUND until"
    warn "Auth exists, so pairing breaks AFTER the web app reports success."
    manual "${FIREBASE_CONSOLE}/authentication/providers  -> enable Email/Password"
}

deploy_rules() {
    step "Deploying the security rules to ${PROJECT_ID}"
    cat <<'TXT'
The rules in firebase/ are the only thing separating one account's sessions
from another's, and deploying the viewer does not apply them. Until this runs,
the project is on whatever the console last set — for a new project, defaults
that are open.

This deploys from your machine. The GitHub Actions workflow still needs its own
credential to keep them applied on every push; the link for that is printed at
the end.
TXT
    confirm "Deploy database + Firestore rules and indexes?" || return 0

    fb deploy \
        --only database,firestore:rules,firestore:indexes \
        --project "$PROJECT_ID" \
        --non-interactive

    bold "Rules deployed."
    echo
    warn "CI still cannot deploy them. So that tightening a rule cannot be merged"
    warn "and then silently left unapplied, add a service-account key as a secret:"
    manual "${FIREBASE_CONSOLE}/settings/serviceaccounts/adminsdk  -> generate a key"
    manual "base64 it, then add it as FIREBASE_SERVICE_ACCOUNT at"
    manual "https://github.com/waleed260/Duxo/settings/secrets/actions/new"
}

provision_railway() {
    step "Railway — give the viewer a public domain"
    cat <<'TXT'
The service builds and deploys, but it is marked "Unexposed": no domain was
ever generated, so nothing routes to it from the internet. That is why the
viewer has never been publicly reachable, and why NEXT_PUBLIC_SITE_URL and
DUXO_WEB_APP_URL have had no value to take — the origin does not exist yet
rather than being unknown.

A browser window will open for you to sign in.
TXT
    confirm "Generate a domain?" || return 0

    railway login
    # --environment as well as --project/--service: without it the CLI prompts
    # for which environment to link, which defeats the point of passing the
    # other two. "production" is the environment in the dashboard dump
    # (116859ed-8570-4b3b-bc8d-2775699b0b10).
    railway link \
        --project "$RAILWAY_PROJECT" \
        --service "$RAILWAY_SERVICE" \
        --environment production
    # No argument: generates a Railway-provided service domain. Pass a hostname
    # instead to attach a custom one, which also prints the DNS records to add.
    railway domain

    echo
    bold "That hostname is the origin everything else needs."
    echo "Set all three in one command. Setting a variable triggers a redeploy,"
    echo "which is required rather than incidental: the NEXT_PUBLIC_* values are"
    echo "inlined at build time, so a restart would not pick them up."
    echo
    echo "  railway variables set \\"
    echo "    NEXT_PUBLIC_SITE_URL=https://<host> \\"
    echo "    NEXT_PUBLIC_METERED_TURN_USERNAME=<user> \\"
    echo "    NEXT_PUBLIC_METERED_TURN_CREDENTIAL=<pass>"
    echo
    manual "TURN credentials (free, no card): https://www.metered.ca/tools/openrelay/"
    manual "DUXO_WEB_APP_URL=https://<host> at https://github.com/waleed260/Duxo/settings/variables/actions"
}

run_checks() {
    step "Checking what actually exists"
    # The probe is the source of truth, not this script's own output: it talks
    # to the live project with the public config in viewer/.env.local and exits
    # non-zero while any service is missing.
    ( cd "$(dirname "$0")/../viewer" && npm run --silent check:backend ) || true
    echo
    echo "Then, once a domain exists:"
    echo "  cd viewer && npm run check:turn"
    echo "  cd viewer && npm run check:deploy -- https://<host>"
}

case "${1:-}" in
    firebase) provision_firebase ;;
    rules)    deploy_rules ;;
    railway)  provision_railway ;;
    check)    run_checks ;;
    *)
        # Print the leading comment block as the usage text, stopping at the
        # first line that is not a comment — a hardcoded line range drifts the
        # moment the header changes, and starts printing the script itself.
        awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
        exit 1
        ;;
esac
