#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

# ─────────────────────────────────────────────
# Defaults
# ─────────────────────────────────────────────
APP_URL=""
BASE_URL=""
TENANT=""
TTX_IS_DEV=true
USE_DEV_LOGIN_EXPLICIT=""   # vide = non forcé
USERNAME="admin"
PASSWORD="Admin123!"
API_KEY=""
VERBOSE=false
CLEAR_FIRST=false
COOKIE_JAR=$(mktemp)

trap 'rm -f "$COOKIE_JAR"' EXIT

# ─────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────
usage() {
  cat <<'EOF'
Usage:
  ./scripts/seed_inject_bank.sh [--url <app_url>] [options]

Options:
  --url <url>         URL d'accès à l'application (demandée si absente)
                        http://localhost:5173  → dev  (backend :3000, dev-login activé)
                        http://localhost       → prod (nginx, dev-login désactivé)
  --no-dev            Forcer l'auth par identifiants plutôt que dev-login
  --username <user>   Nom d'utilisateur admin (défaut: admin)
  --password <pass>   Mot de passe admin (défaut: Admin123!)
  --api-key <key>     Utiliser directement une clé API existante
  --clear             Vider la banque avant de seed
  --verbose           Afficher les réponses JSON complètes
  --help, -h          Afficher cette aide

Description:
  Seeds the inject bank with one example inject per type (kind):
  mail, sms, call, socialnet, tv, doc, directory, story

Examples:
  ./scripts/seed_inject_bank.sh
  ./scripts/seed_inject_bank.sh --url http://localhost:5173 --clear
  ./scripts/seed_inject_bank.sh --url http://localhost --no-dev --password Admin123!
  ./scripts/seed_inject_bank.sh --url https://ttx.example.com --api-key ttx_xxxxx
EOF
}

# ─────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)        APP_URL="$2"; shift 2 ;;
    --no-dev)     USE_DEV_LOGIN_EXPLICIT=false; shift ;;
    --username)   USERNAME="$2"; shift 2 ;;
    --password)   PASSWORD="$2"; shift 2 ;;
    --api-key)    API_KEY="$2"; shift 2 ;;
    --clear)      CLEAR_FIRST=true; shift ;;
    --verbose)    VERBOSE=true; shift ;;
    --help|-h)    usage; exit 0 ;;
    *)            print_error "Option inconnue: $1"; usage; exit 1 ;;
  esac
done

# ─────────────────────────────────────────────
# Resolve URL → BASE_URL, TENANT, TTX_IS_DEV
# ─────────────────────────────────────────────
prompt_app_url

# Appliquer dev-login : explicite > déduit de l'environnement
if [[ -n "$USE_DEV_LOGIN_EXPLICIT" ]]; then
  USE_DEV_LOGIN="$USE_DEV_LOGIN_EXPLICIT"
else
  USE_DEV_LOGIN="$TTX_IS_DEV"
fi

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
log_ok()   { echo -e "${GREEN}✓${NC} $1"; }
log_err()  { echo -e "${RED}✗${NC} $1"; }
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }

TOTAL_STEPS=10
[[ "$CLEAR_FIRST" == "true" ]] && TOTAL_STEPS=11
CURRENT_STEP=0

progress() {
  local label="$1"
  CURRENT_STEP=$((CURRENT_STEP + 1))
  local pct=$((CURRENT_STEP * 100 / TOTAL_STEPS))
  local filled=$((pct / 5))
  local empty=$((20 - filled))
  local bar
  bar=$(printf '%0.s█' $(seq 1 "$filled" 2>/dev/null))
  bar+=$(printf '%0.s░' $(seq 1 "$empty" 2>/dev/null))
  echo ""
  echo -e "${CYAN}[${CURRENT_STEP}/${TOTAL_STEPS}]${NC} ${bar} ${pct}%  ${YELLOW}${label}${NC}"
}

# api_call METHOD PATH [JSON_BODY]
api_call() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="${BASE_URL}${path}"

  local -a curl_args=(
    -s -w '\n%{http_code}'
    -X "$method"
    -H "Host: ${TENANT}"
    -H "Content-Type: application/json"
    -b "$COOKIE_JAR"
    -c "$COOKIE_JAR"
  )

  if [[ -n "$API_KEY" ]]; then
    curl_args+=(-H "X-API-Key: ${API_KEY}")
  fi

  if [[ -n "$body" ]]; then
    curl_args+=(-d "$body")
  fi

  local raw
  raw=$(curl "${curl_args[@]}" "$url")

  HTTP_STATUS=$(echo "$raw" | tail -n1)
  RESPONSE=$(echo "$raw" | sed '$d')

  if [[ "$VERBOSE" == "true" ]]; then
    echo -e "${CYAN}  ${method} ${path} → ${HTTP_STATUS}${NC}"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
  fi
}

check_status() {
  local context="$1"
  local expected="${2:-2}"
  if [[ "${HTTP_STATUS:0:1}" != "$expected" ]]; then
    log_err "${context} — HTTP ${HTTP_STATUS}"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    exit 1
  fi
}

echo ""
echo "════════════════════════════════════════════════════════"
echo "  TTX Inject Bank Seed Script (via REST API)"
echo "════════════════════════════════════════════════════════"
echo ""
log_info "App URL:  ${APP_URL}"
log_info "API URL:  ${BASE_URL}"
log_info "Tenant:   ${TENANT}"
log_info "Env:      $( [[ "$TTX_IS_DEV" == "true" ]] && echo "dev (dev-login disponible)" || echo "prod (auth par identifiants)" )"
[[ "$CLEAR_FIRST" == "true" ]] && log_info "Mode:     clear + seed"

# ─────────────────────────────────────────────
# Step 1: Authentication
# ─────────────────────────────────────────────
progress "Authentification"

if [[ -n "$API_KEY" ]]; then
  log_info "Using provided API key: ${API_KEY:0:12}..."
else
  if [[ "$USE_DEV_LOGIN" == "true" ]]; then
    log_info "Authenticating via dev-login..."
    api_call POST "/api/auth/dev-login/admin"
    check_status "Dev login"
    log_ok "Dev login successful"
  else
    log_info "Authenticating with credentials (${USERNAME})..."
    api_call POST "/api/auth/login" "{\"username_or_email\": \"${USERNAME}\", \"password\": \"${PASSWORD}\"}"
    check_status "Login"
    log_ok "Login successful"
  fi

  log_info "Creating API key..."
  EPOCH=$(date +%s)
  api_call POST "/api/admin/api-keys" "{\"name\": \"seed-inject-bank-${EPOCH}\"}"
  check_status "Create API key"
  API_KEY=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['key'])")
  log_ok "API key created: ${API_KEY:0:12}...${API_KEY: -4}"
fi

# ─────────────────────────────────────────────
# Step 2 (optional): Clear existing items
# ─────────────────────────────────────────────
if [[ "$CLEAR_FIRST" == "true" ]]; then
  progress "Vidage de la banque"

  # Bulk delete via clear-all
  api_call DELETE "/api/inject-bank/clear-all"
  check_status "Clear inject bank"
  DELETED=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['deleted'])")
  log_ok "clear-all : ${DELETED} item(s) supprimé(s)"

  # Verify: delete any remaining items individually (e.g. items with NULL owner_tenant_id)
  api_call GET "/api/inject-bank?page_size=100"
  check_status "List remaining items"
  REMAINING=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")

  if [[ "$REMAINING" -gt 0 ]]; then
    log_info "Suppression des ${REMAINING} item(s) restant(s) un par un..."
    REMAINING_IDS=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(' '.join(str(i['id']) for i in data['items']))
")
    for item_id in $REMAINING_IDS; do
      api_call DELETE "/api/inject-bank/${item_id}"
      check_status "Delete item ${item_id}"
    done
    log_ok "Items restants supprimés"
  fi

  log_ok "Banque vidée — total supprimé : $((DELETED + REMAINING)) item(s)"
fi

CREATED=0

create_item() {
  api_call POST "/api/inject-bank" "$1"
  check_status "Create inject bank item"
  ITEM_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  CREATED=$((CREATED + 1))
}

# ─────────────────────────────────────────────
# MAIL — from / to / subject / body
# ─────────────────────────────────────────────
progress "Inject MAIL"

create_item '{
  "title": "Email direction - Alerte sécurité critique",
  "kind": "mail",
  "status": "ready",
  "data_format": "text",
  "category": "incident",
  "summary": "Notification interne de la DSI vers la direction signalant une alerte de sécurité critique nécessitant une décision immédiate.",
  "content": "Madame, Monsieur,\n\nNous détectons une activité anormale sur notre infrastructure IT. Les indicateurs pointent vers une intrusion active.\n\nPoints clés :\n- Détection : 09h14 ce matin\n- Systèmes potentiellement touchés : serveurs applicatifs site principal\n- Niveau de risque : CRITIQUE\n\nAction requise : merci de confirmer la mise en place de la cellule de crise dans l'\''heure.\n\nCordialement,\nMarc Dubois — RSSI",
  "tags": ["securite", "direction", "incident", "DSI"],
  "payload": {
    "from": "rssi@corp.example.fr",
    "to": ["direction@corp.example.fr"],
    "subject": "URGENT : Alerte sécurité critique — Action requise",
    "body": "Madame, Monsieur,\n\nNous détectons une activité anormale sur notre infrastructure IT. Les indicateurs pointent vers une intrusion active.\n\nPoints clés :\n- Détection : 09h14 ce matin\n- Systèmes potentiellement touchés : serveurs applicatifs site principal\n- Niveau de risque : CRITIQUE\n\nAction requise : merci de confirmer la mise en place de la cellule de crise dans l'\''heure.\n\nCordialement,\nMarc Dubois — RSSI"
  }
}'
log_ok "MAIL créé (id=${ITEM_ID})"

# ─────────────────────────────────────────────
# SMS — from / to (array) / message
# ─────────────────────────────────────────────
progress "Inject SMS"

create_item '{
  "title": "SMS supervision - Serveur hors ligne",
  "kind": "sms",
  "status": "ready",
  "data_format": "text",
  "category": "incident",
  "summary": "SMS automatique du système de supervision signalant qu'\''un serveur critique est hors ligne.",
  "content": "[SUPERVISION] ALERTE CRITIQUE — SRV-PROD-01 hors ligne depuis 08:47. Service indisponible. Intervention immédiate requise. Réf: INC-2024-0847",
  "tags": ["supervision", "alerte", "infrastructure"],
  "payload": {
    "from": "+33600000001",
    "to": ["+33600000002"],
    "message": "[SUPERVISION] ALERTE CRITIQUE — SRV-PROD-01 hors ligne depuis 08:47. Service indisponible. Intervention immédiate requise. Réf: INC-2024-0847"
  }
}'
log_ok "SMS créé (id=${ITEM_ID})"

# ─────────────────────────────────────────────
# CALL — from / to / duration_sec / transcript
# ─────────────────────────────────────────────
progress "Inject CALL"

create_item '{
  "title": "Appel téléphonique - Journaliste Le Monde",
  "kind": "call",
  "status": "ready",
  "data_format": "text",
  "category": "media",
  "summary": "Un journaliste d'\''un grand quotidien national appelle le service communication pour obtenir une réaction officielle sur l'\''incident en cours.",
  "content": "Thomas Garnier, Le Monde : Bonjour, nous avons reçu des informations selon lesquelles votre organisation serait victime d'\''une cyberattaque majeure ce matin. Pouvez-vous confirmer ? Quels sont les services impactés ? Y a-t-il des données personnelles compromises ? Nous publions dans 2 heures — avez-vous un commentaire officiel ?",
  "tags": ["media", "presse", "communication", "crise"],
  "payload": {
    "from": "+33142172000",
    "to": "+33100000001",
    "duration_sec": 180,
    "transcript": "Thomas Garnier, Le Monde : Bonjour, nous avons reçu des informations selon lesquelles votre organisation serait victime d'\''une cyberattaque majeure ce matin. Pouvez-vous confirmer ? Quels sont les services impactés ? Y a-t-il des données personnelles compromises ? Nous publions dans 2 heures — avez-vous un commentaire officiel ?"
  }
}'
log_ok "CALL créé (id=${ITEM_ID})"

# ─────────────────────────────────────────────
# SOCIALNET — author_name / author_handle / text / likes / reposts / replies / views
# ─────────────────────────────────────────────
progress "Inject SOCIALNET"

create_item '{
  "title": "Tweet viral - Employé révèle l'\''incident",
  "kind": "socialnet",
  "status": "ready",
  "data_format": "text",
  "category": "media",
  "summary": "Un employé publie un tweet évoquant des problèmes informatiques majeurs, qui devient viral et attire l'\''attention des médias.",
  "content": "Situation catastrophique au bureau aujourd'\''hui. Tous les PC affichent un message bizarre, l'\''accès aux fichiers est bloqué. Les collègues parlent de ransomware. La direction ne dit rien. #cyberattaque #ransomware #alerte",
  "tags": ["twitter", "reseaux-sociaux", "crise", "viral"],
  "payload": {
    "author_name": "Employé anonyme",
    "author_handle": "@insider_corp",
    "text": "Situation catastrophique au bureau aujourd'\''hui. Tous les PC affichent un message bizarre, l'\''accès aux fichiers est bloqué. Les collègues parlent de ransomware. La direction ne dit rien. #cyberattaque #ransomware #alerte",
    "likes": 847,
    "reposts": 312,
    "replies": 94,
    "views": 15200
  }
}'
log_ok "SOCIALNET créé (id=${ITEM_ID})"

# ─────────────────────────────────────────────
# TV — channel / headline / body
# ─────────────────────────────────────────────
progress "Inject TV"

create_item '{
  "title": "Flash info BFM - Cyberattaque secteur",
  "kind": "tv",
  "status": "ready",
  "data_format": "text",
  "category": "media",
  "summary": "BFM Business diffuse un flash info sur une cyberattaque touchant une entreprise du secteur, créant une pression médiatique supplémentaire.",
  "content": "FLASH BFM Business — Cyberattaque majeure : une entreprise du secteur paralysée. Plusieurs sites de production à l'\''arrêt. L'\''action en bourse recule de 4,5%. Les autorités, dont l'\''ANSSI, auraient été alertées.",
  "tags": ["tv", "bfm", "media", "flash-info", "crise"],
  "payload": {
    "channel": "BFM Business",
    "headline": "FLASH — Cyberattaque majeure : une entreprise du secteur paralysée",
    "body": "Selon nos informations, une entreprise importante du secteur est victime depuis ce matin d'\''une cyberattaque de grande ampleur. Plusieurs sites de production seraient à l'\''arrêt. L'\''action en bourse recule de 4,5%. Les autorités, dont l'\''ANSSI, auraient été alertées. La direction n'\''a pas encore communiqué officiellement. Nous suivons cette information en direct.",
    "banner_text": "CYBERATTAQUE — Production à l'\''arrêt sur plusieurs sites"
  }
}'
log_ok "TV créé (id=${ITEM_ID})"

# ─────────────────────────────────────────────
# DOC — document_type / title / body
# ─────────────────────────────────────────────
progress "Inject DOC"

create_item '{
  "title": "Rapport forensique SOC — Synthèse exécutive",
  "kind": "doc",
  "status": "ready",
  "data_format": "text",
  "category": "technique",
  "summary": "Rapport de synthèse forensique produit par l'\''équipe SOC après les premières heures d'\''investigation, listant les indicateurs de compromission identifiés.",
  "content": "RÉSUMÉ EXÉCUTIF — Rédacteur : Équipe SOC / CSIRT — Classification : CONFIDENTIEL\n\nVECTEUR : Phishing ciblé il y a 21 jours, installation d'\''un RAT Cobalt Strike.\n\nCHRONOLOGIE : J-21 compromission, J-15 mouvement latéral, J-3 exfiltration, J0 06h12 ransomware.\n\nIOC : Hash BlackCat/ALPHV, IP C2 185.220.xxx.xxx, comptes compromis svc_backup / svc_deploy / adm_infra01.\n\nRECOMMANDATIONS : Isolation 10.1.x.x, reset comptes AD, activation PRA.",
  "tags": ["forensique", "SOC", "IOC", "technique", "rapport"],
  "payload": {
    "document_type": "rapport",
    "title": "Rapport forensique — Synthèse exécutive",
    "body": "RÉSUMÉ EXÉCUTIF\n\nRédacteur : Équipe SOC / CSIRT\nClassification : CONFIDENTIEL\n\n1. VECTEUR D'\''ENTRÉE\nPhishing ciblé reçu il y a 21 jours par un compte à privilèges. Installation d'\''un RAT de la famille Cobalt Strike.\n\n2. CHRONOLOGIE\n- J-21 : Compromission initiale via phishing\n- J-15 : Début du mouvement latéral (comptes de service)\n- J-3 : Exfiltration de données vers serveur C2 externe\n- J0, 06h12 : Déclenchement du ransomware\n\n3. INDICATEURS DE COMPROMISSION\n- Hash malware : 3a4b5c6d7e8f (variante BlackCat/ALPHV)\n- IP C2 : 185.220.xxx.xxx (Tor exit node)\n- Comptes compromis : svc_backup, svc_deploy, adm_infra01\n\n4. RECOMMANDATIONS IMMÉDIATES\n- Isolation complète du segment 10.1.x.x\n- Reset de tous les comptes de service Active Directory\n- Activation du plan de reprise d'\''activité"
  }
}'
log_ok "DOC créé (id=${ITEM_ID})"

# ─────────────────────────────────────────────
# DIRECTORY — directory_type / entries[] (partner / contact / phone / priority)
# ─────────────────────────────────────────────
progress "Inject DIRECTORY"

create_item '{
  "title": "Annuaire de crise — Contacts clés",
  "kind": "directory",
  "status": "ready",
  "data_format": "text",
  "category": "ressource",
  "summary": "Annuaire des contacts essentiels à activer lors d'\''une crise cyber : autorités, prestataires, équipes internes.",
  "content": "ANSSI / CERT-FR : +33 1 71 75 84 68 — cert-fr@ssi.gouv.fr (priorité haute)\nCNIL : +33 1 53 73 22 22 — notifications@cnil.fr (priorité haute)\nAssurance cyber : +33 1 XX XX XX XX (priorité moyenne)\nCrowdStrike IR (retainer) : +1 877 934 2602 (priorité haute)\nDPO interne : +33 6 XX XX XX XX (priorité moyenne)",
  "tags": ["annuaire", "contacts", "crise", "ressource"],
  "payload": {
    "directory_type": "contacts_crise",
    "entries": [
      {
        "partner": "ANSSI — CERT-FR",
        "contact": "Autorité nationale de sécurité",
        "phone": "+33 1 71 75 84 68",
        "priority": "haute"
      },
      {
        "partner": "CNIL",
        "contact": "Délégué aux plaintes — violation données",
        "phone": "+33 1 53 73 22 22",
        "priority": "haute"
      },
      {
        "partner": "Assurance cyber",
        "contact": "Gestionnaire sinistres",
        "phone": "+33 1 XX XX XX XX",
        "priority": "moyenne"
      },
      {
        "partner": "CrowdStrike Services",
        "contact": "Prestataire IR (sous contrat retainer)",
        "phone": "+1 877 934 2602",
        "priority": "haute"
      },
      {
        "partner": "DPO interne — Claire Fontaine",
        "contact": "Délégué à la Protection des Données",
        "phone": "+33 6 XX XX XX XX",
        "priority": "moyenne"
      }
    ]
  }
}'
log_ok "DIRECTORY créé (id=${ITEM_ID})"

# ─────────────────────────────────────────────
# STORY — scenario_title / context / key_points[]
# ─────────────────────────────────────────────
progress "Inject STORY"

create_item '{
  "title": "Scénario — Propagation vers réseau OT/SCADA",
  "kind": "story",
  "status": "ready",
  "data_format": "text",
  "category": "scenario",
  "summary": "Développement narratif décrivant la propagation d'\''un ransomware depuis le réseau IT vers le réseau OT/SCADA, forçant un arbitrage critique entre sécurité et continuité de production.",
  "content": "Il est 11h30. La passerelle IT/OT (192.168.100.254) montre des signes de compromission. Les automates du site de production se comportent de manière anormale.\n\nDÉCISION CRITIQUE : Couper la passerelle = arrêt production (2M€/jour) + livraison client compromise lundi. Ne pas couper = destruction irréversible des automates SCADA (10-15M€, 3-6 mois).\n\nLe responsable production, le DSI et le DG doivent s'\''aligner dans les 10 prochaines minutes.",
  "tags": ["scenario", "OT", "SCADA", "propagation", "arbitrage"],
  "payload": {
    "scenario_title": "Propagation IT → OT : arbitrage production vs sécurité",
    "context": "Il est 11h30. Deux heures après la détection initiale, le ransomware se rapproche du réseau OT. La passerelle IT/OT (192.168.100.254) montre des signes de compromission. Les automates du site de production se comportent de manière anormale.\n\nCouper la passerelle arrête la production : 2M€/jour de perte, livraison client compromise lundi.\nNe pas couper expose les automates SCADA à une destruction irréversible : 10-15M€ et 3 à 6 mois de remise en état.\n\nLe responsable production, le DSI et le DG doivent s'\''aligner dans les 10 prochaines minutes.",
    "key_points": [
      "Passerelle IT/OT compromise — propagation imminente vers SCADA",
      "Arbitrage : arrêt production (2M€/jour) vs destruction automates (10-15M€)",
      "Deadline décision : 10 minutes",
      "Livraison client stratégique prévue lundi"
    ]
  }
}'
log_ok "STORY créé (id=${ITEM_ID})"

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
progress "Terminé"

echo ""
echo "════════════════════════════════════════════════════════"
echo ""
log_ok "${CREATED}/8 injects créés dans la banque (1 par type)"
echo ""
echo -e "  Types couverts : ${CYAN}mail, sms, call, socialnet, tv, doc, directory, story${NC}"
echo ""
echo "  Banque d'injects : ${APP_URL%/}/inject-bank"
echo ""
