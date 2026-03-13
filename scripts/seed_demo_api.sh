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
COOKIE_JAR=$(mktemp)
EPOCH=$(date +%s)

trap 'rm -f "$COOKIE_JAR"' EXIT

# ─────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────
usage() {
  cat <<'EOF'
Usage:
  ./scripts/seed_demo_api.sh [--url <app_url>] [options]

Options:
  --url <url>         URL d'accès à l'application (demandée si absente)
                        http://localhost:5173  → dev  (backend :3000, dev-login activé)
                        http://localhost       → prod (nginx, dev-login désactivé)
  --no-dev            Forcer l'auth par identifiants plutôt que dev-login
  --username <user>   Nom d'utilisateur admin (défaut: admin)
  --password <pass>   Mot de passe admin (défaut: Admin123!)
  --api-key <key>     Utiliser directement une clé API existante
  --verbose           Afficher les réponses JSON complètes
  --help, -h          Afficher cette aide

Examples:
  ./scripts/seed_demo_api.sh
  ./scripts/seed_demo_api.sh --url http://localhost:5173
  ./scripts/seed_demo_api.sh --url http://localhost --no-dev --password Admin123!
  ./scripts/seed_demo_api.sh --url https://ttx.example.com --api-key ttx_xxxxx
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

# ─── Progress bar ────────────────────────────
TOTAL_STEPS=8
CURRENT_STEP=0

progress() {
  local label="$1"
  CURRENT_STEP=$((CURRENT_STEP + 1))
  local pct=$((CURRENT_STEP * 100 / TOTAL_STEPS))
  local filled=$((pct / 5))        # 20 chars wide
  local empty=$((20 - filled))
  local bar
  bar=$(printf '%0.s█' $(seq 1 "$filled" 2>/dev/null) )
  bar+=$(printf '%0.s░' $(seq 1 "$empty" 2>/dev/null) )
  echo ""
  echo -e "${CYAN}[${CURRENT_STEP}/${TOTAL_STEPS}]${NC} ${bar} ${pct}%  ${YELLOW}${label}${NC}"
}

# api_call METHOD PATH [JSON_BODY]
# Stores response body in $RESPONSE and HTTP status in $HTTP_STATUS
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

  # Last line is HTTP status code
  HTTP_STATUS=$(echo "$raw" | tail -n1)
  RESPONSE=$(echo "$raw" | sed '$d')

  if [[ "$VERBOSE" == "true" ]]; then
    echo -e "${CYAN}  ${method} ${path} → ${HTTP_STATUS}${NC}"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
  fi
}

check_status() {
  local context="$1"
  local expected="${2:-2}"  # prefix match: 2 matches 2xx
  if [[ "${HTTP_STATUS:0:1}" != "$expected" ]]; then
    log_err "${context} — HTTP ${HTTP_STATUS}"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    exit 1
  fi
}

echo ""
echo "════════════════════════════════════════════════════════"
echo "  TTX Demo Seed Script (via REST API)"
echo "════════════════════════════════════════════════════════"
echo ""
log_info "App URL:  ${APP_URL}"
log_info "API URL:  ${BASE_URL}"
log_info "Tenant:   ${TENANT}"
log_info "Env:      $( [[ "$TTX_IS_DEV" == "true" ]] && echo "dev (dev-login disponible)" || echo "prod (auth par identifiants)" )"

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
  api_call POST "/api/admin/api-keys" "{\"name\": \"seed-demo-${EPOCH}\"}"
  check_status "Create API key"
  API_KEY=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['key'])")
  log_ok "API key created: ${API_KEY:0:12}...${API_KEY: -4}"
fi

# ─────────────────────────────────────────────
# Step 2: Configure Organization
# ─────────────────────────────────────────────
progress "Configuration organisation"

api_call PUT "/api/admin/config" '{
  "organization_name": "Duval Industries",
  "organization_sector": "Industrie / manufacture",
  "organization_description": "Groupe industriel français spécialisé dans la fabrication de composants aéronautiques de haute précision. 4 500 employés répartis sur 3 sites de production (Toulouse, Bordeaux, Nantes) et un siège social à Paris-La Défense. CA annuel de 850M€, clients principaux : Airbus, Safran, Dassault Aviation.",
  "organization_reference_url": "https://www.duval-industries.example.com",
  "organization_keywords": "aéronautique, composants, industrie, manufacturing, OT/IT, SCADA, MES",
  "organization_tech_stack": "SAP ERP, Active Directory, VMware vSphere, Fortinet, Microsoft 365, Schneider Electric SCADA, Siemens MES",
  "windows_domain": "corp.duval-industries.local",
  "public_domain": "duval-industries.fr",
  "mail_domain": "duval-industries.fr",
  "internal_ip_ranges": "10.1.0.0/16 (Siège Paris-La Défense)\n10.2.0.0/16 (Site Toulouse)\n10.3.0.0/16 (Site Bordeaux)\n10.4.0.0/16 (Site Nantes)\n192.168.100.0/24 (Réseau OT Toulouse)",
  "dmz_ip_ranges": "172.16.1.0/24 (DMZ Web publique)\n172.16.2.0/24 (DMZ Partenaires / VPN Airbus)\n172.16.3.0/24 (Relais SMTP sortant)",
  "domain_controllers": "SRV-PAR-DC01.corp.duval-industries.local (PDC, Paris)\nSRV-PAR-DC02.corp.duval-industries.local (Paris)\nSRV-TOUL-DC01.corp.duval-industries.local (Toulouse)\nSRV-BDX-DC01.corp.duval-industries.local (Bordeaux)",
  "server_naming_examples": "SRV-PAR-APP01 (Applicatif Paris)\nSRV-TOUL-MES01 (MES Production Toulouse)\nSRV-TOUL-FS01 (File Server Toulouse)\nSRV-BDX-DB01 (Base de données Bordeaux)\nSRV-PAR-EXCH01 (Exchange Paris)",
  "technological_dependencies": "SAP S/4HANA (ERP production et logistique)\nMicrosoft Exchange Online (messagerie)\nSchneider Electric EcoStruxure (SCADA OT)\nSiemens SIMATIC WinCC (MES production)\nSplunk Enterprise (SIEM)\nCrowdStrike Falcon (EDR)\nVeeam Backup & Replication\nCitrix Virtual Apps (accès distant)\nFortinet FortiGate (pare-feu périmétrique)",
  "cloud_providers": "Microsoft Azure (IaaS/PaaS principal, AD Connect)\nAWS S3 (stockage archives et sauvegardes off-site)\nOVHcloud (hébergement site vitrine duval-industries.fr)",
  "critical_applications": "SAP S/4HANA — ERP production, logistique, finance\nSiemens MES — pilotage chaînes fabrication composants\nSchneider SCADA — supervision automates industriels OT\nMicrosoft Exchange — messagerie interne/externe\nSharePoint Online — documentation technique et plans\nSalesforce — CRM et gestion commerciale\nVeeam — sauvegardes serveurs et VMs\nActive Directory — authentification centralisée",
  "bia_processes": "[{\"id\":\"bia-001\",\"process_name\":\"Production MES\",\"description\":\"Pilotage des chaînes de fabrication composants aéronautiques\",\"department\":\"Production\",\"criticality\":\"vital\",\"rto_hours\":4,\"rpo_minutes\":30,\"mtpd_hours\":12,\"priority\":\"P1\",\"operational_impact\":true,\"regulatory_impact\":true,\"financial_impact\":\"fort\",\"degraded_mode\":\"Pilotage manuel des lignes avec fiches papier\",\"dependencies_it\":[\"Réseau OT\",\"Serveurs SCADA\",\"Active Directory\"],\"dependencies_external\":[\"Siemens Support\",\"Schneider Electric\"]},{\"id\":\"bia-002\",\"process_name\":\"SAP ERP\",\"description\":\"ERP production, logistique et finance\",\"department\":\"Finance / Production\",\"criticality\":\"vital\",\"rto_hours\":8,\"rpo_minutes\":60,\"mtpd_hours\":24,\"priority\":\"P1\",\"operational_impact\":true,\"regulatory_impact\":false,\"financial_impact\":\"fort\",\"degraded_mode\":\"Bascule sur procédures manuelles et tableurs de suivi\",\"dependencies_it\":[\"Active Directory\",\"Réseau WAN inter-sites\"],\"dependencies_external\":[\"SAP Support\",\"Microsoft Azure\"]},{\"id\":\"bia-003\",\"process_name\":\"Active Directory\",\"description\":\"Authentification centralisée et contrôle d accès\",\"department\":\"DSI\",\"criticality\":\"vital\",\"rto_hours\":2,\"rpo_minutes\":15,\"mtpd_hours\":4,\"priority\":\"P1\",\"operational_impact\":true,\"regulatory_impact\":false,\"financial_impact\":\"fort\",\"degraded_mode\":\"Comptes locaux d urgence pré-provisionnés\",\"dependencies_it\":[\"Contrôleurs de domaine\",\"DNS interne\"],\"dependencies_external\":[\"Microsoft Azure AD Connect\"]},{\"id\":\"bia-004\",\"process_name\":\"Messagerie Exchange\",\"description\":\"Communication interne et externe par email\",\"department\":\"DSI\",\"criticality\":\"critique\",\"rto_hours\":12,\"rpo_minutes\":240,\"mtpd_hours\":48,\"priority\":\"P2\",\"operational_impact\":true,\"regulatory_impact\":false,\"financial_impact\":\"moyen\",\"degraded_mode\":\"Communication par téléphone et Teams\",\"dependencies_it\":[\"Active Directory\",\"DNS public\"],\"dependencies_external\":[\"Microsoft 365\"]},{\"id\":\"bia-005\",\"process_name\":\"Site web corporate\",\"description\":\"Présence web publique duval-industries.fr\",\"department\":\"Communication\",\"criticality\":\"faible\",\"rto_hours\":72,\"rpo_minutes\":1440,\"mtpd_hours\":168,\"priority\":\"P4\",\"operational_impact\":false,\"regulatory_impact\":false,\"financial_impact\":\"faible\",\"degraded_mode\":\"Page de maintenance statique\",\"dependencies_it\":[],\"dependencies_external\":[\"OVHcloud\"]},{\"id\":\"bia-006\",\"process_name\":\"CRM Salesforce\",\"description\":\"Gestion commerciale et relation client\",\"department\":\"Direction commerciale\",\"criticality\":\"moyen\",\"rto_hours\":24,\"rpo_minutes\":720,\"mtpd_hours\":72,\"priority\":\"P3\",\"operational_impact\":false,\"regulatory_impact\":false,\"financial_impact\":\"moyen\",\"degraded_mode\":\"Suivi commercial via tableurs partagés\",\"dependencies_it\":[\"Accès internet\"],\"dependencies_external\":[\"Salesforce\"]}]"
}'
check_status "Configure organization"
log_ok "Organization configured: Duval Industries"

# ─────────────────────────────────────────────
# Step 3: Create Exercise (unique name with epoch)
# ─────────────────────────────────────────────
progress "Création exercice"

EXERCISE_NAME="CYBER-STORM-${EPOCH}"
api_call POST "/api/exercises" "{
  \"name\": \"${EXERCISE_NAME}\",
  \"description\": \"Exercice de simulation de crise ransomware ciblant l'infrastructure IT/OT de Duval Industries. Scénario : un groupe APT déploie un ransomware après 3 semaines de présence non détectée dans le SI.\",
  \"exercise_type\": \"ransomware\",
  \"target_duration_hours\": 4,
  \"maturity_level\": \"intermediate\",
  \"mode\": \"real_time\",
  \"time_multiplier\": 1,
  \"business_objective\": \"Valider la capacité de la direction à piloter une crise ransomware impliquant des enjeux IT et OT, à communiquer avec les parties prenantes (ANSSI, clients, médias) et à prendre des décisions stratégiques sous pression.\",
  \"technical_objective\": \"Évaluer la réponse technique à un incident ransomware : détection SOC, isolation réseau, analyse forensique, vérification des sauvegardes, plan de remédiation et reprise d'activité.\",
  \"phase_preset\": \"classique\"
}"
check_status "Create exercise"
EXERCISE_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
log_ok "Exercise created: ${EXERCISE_NAME} (id=${EXERCISE_ID})"

# ─────────────────────────────────────────────
# Step 4: Configure Scenario
# ─────────────────────────────────────────────
progress "Configuration scénario"

api_call PUT "/api/exercises/${EXERCISE_ID}/scenario" '{
  "strategic_intent": "Tester la capacité de réponse globale de Duval Industries à une attaque ransomware sophistiquée ciblant simultanément les environnements IT et OT, en évaluant la coordination entre les équipes techniques, la direction et les parties prenantes externes.",
  "initial_context": "Vendredi 14h00. Duval Industries opère normalement. Le site de production de Toulouse tourne à plein régime pour honorer une commande Airbus critique (deadline lundi). Le RSSI est en déplacement à Bordeaux. Le DSI est présent au siège.",
  "initial_situation": "Le SOC détecte une alerte SIEM de priorité haute : activité suspecte de type lateral movement sur le segment serveurs du site de Toulouse. Plusieurs comptes de service Active Directory montrent des connexions inhabituelles depuis 6h du matin. Le volume de trafic DNS sortant a augmenté de 300% sur les dernières 24h.",
  "implicit_hypotheses": "Les sauvegardes existent mais leur intégrité est incertaine (dernière vérification il y a 6 mois). Le PRA/PCA existe sur le papier mais n'\''a jamais été testé en conditions réelles. L'\''assurance cyber couvre théoriquement ce type d'\''incident.",
  "hidden_brief": "L'\''attaquant (groupe BlackCat/ALPHV) est présent dans le SI depuis 3 semaines via un phishing ciblé sur un ingénieur de production. Il a déjà exfiltré 200 Go de données (plans techniques, données RH, contrats clients). Les sauvegardes du site de Toulouse sont compromises (agent dormant installé il y a 2 semaines). Le site de Nantes n'\''est pas encore touché.",
  "pedagogical_objectives": [
    "Coordination inter-équipes (IT, production, direction, juridique, communication)",
    "Communication de crise multi-canal (interne, ANSSI, clients, médias)",
    "Prise de décision sous pression temporelle (72h CNIL, deadline client)",
    "Gestion de la chaîne de commandement en mode dégradé",
    "Arbitrage entre continuité de production et sécurité du SI"
  ],
  "evaluation_criteria": [
    "Temps de réaction entre détection et activation de la cellule de crise",
    "Qualité de la communication interne et externe",
    "Pertinence des décisions techniques (isolation, forensique, remédiation)",
    "Respect des obligations légales (ANSSI, CNIL, contractuelles)",
    "Coordination entre les sites et les équipes"
  ],
  "stress_factors": [
    "Pression médiatique croissante (fuite Twitter, article de presse)",
    "Deadline CNIL 72h pour notification de violation de données",
    "Commande Airbus critique à livrer lundi",
    "RSSI absent du siège (en déplacement)",
    "Demande de rançon de 2.5M€ avec deadline 48h",
    "Propagation potentielle vers le réseau OT/SCADA"
  ]
}'
check_status "Configure scenario"
log_ok "Scenario configured"

# ─────────────────────────────────────────────
# Step 5: Create Escalation Axes
# ─────────────────────────────────────────────
progress "Axes d'escalade"

AXES_CREATED=0
for axis in \
  '{"axis_type":"technical","intensity":8,"notes":"Propagation ransomware IT→OT, compromission AD, sauvegardes partiellement corrompues"}' \
  '{"axis_type":"communication","intensity":6,"notes":"Fuite sur les réseaux sociaux, sollicitations presse, communication interne à gérer"}' \
  '{"axis_type":"legal","intensity":7,"notes":"Notification ANSSI obligatoire, CNIL 72h, clauses contractuelles clients aéronautique"}' \
  '{"axis_type":"political","intensity":4,"notes":"Risque de questionnement par les autorités de tutelle (DGAC) si impact sur production aéro"}' \
  '{"axis_type":"media","intensity":5,"notes":"Article presse spécialisée, tweet viral, risque de reprise par les médias nationaux"}' \
; do
  api_call POST "/api/exercises/${EXERCISE_ID}/escalation-axes" "$axis"
  check_status "Create escalation axis"
  AXES_CREATED=$((AXES_CREATED + 1))
done
log_ok "${AXES_CREATED} escalation axes created"

# ─────────────────────────────────────────────
# Step 6: Fetch auto-created phases + update offsets
# ─────────────────────────────────────────────
progress "Configuration phases"

api_call GET "/api/exercises/${EXERCISE_ID}/phases"
check_status "Fetch phases"

# Extract phase info (ordered by phase_order) as TSV: id\tname\tphase_order
PHASE_INFO=$(echo "$RESPONSE" | python3 -c "
import sys, json
phases = json.load(sys.stdin)
for p in sorted(phases, key=lambda x: x['phase_order']):
    print(f\"{p['id']}\t{p['name']}\t{p['phase_order']}\")
")
PHASE_COUNT=$(echo "$PHASE_INFO" | wc -l | tr -d '[:space:]')

# Store phase IDs in an array for inject assignment
readarray -t PHASE_ID_ARRAY < <(echo "$PHASE_INFO" | cut -f1)
readarray -t PHASE_NAME_ARRAY < <(echo "$PHASE_INFO" | cut -f2)
readarray -t PHASE_ORDER_ARRAY < <(echo "$PHASE_INFO" | cut -f3)

# Update phase time offsets for the 4h exercise
PHASE_OFFSETS=(
  "0 15"       # Détection: T+0 → T+15
  "15 30"      # Qualification: T+15 → T+30
  "30 45"      # Alerte: T+30 → T+45
  "45 60"      # Activation cellule: T+45 → T+60
  "60 100"     # Analyse situation: T+60 → T+100
  "100 140"    # Décisions stratégiques: T+100 → T+140
  "140 180"    # Endiguement: T+140 → T+180
  "180 220"    # Remédiation technique: T+180 → T+220
  "220 240"    # Clôture de crise: T+220 → T+240
)

for i in "${!PHASE_ID_ARRAY[@]}"; do
  if [[ $i -lt ${#PHASE_OFFSETS[@]} ]]; then
    read -r start end <<< "${PHASE_OFFSETS[$i]}"
    phase_name=$(echo "${PHASE_NAME_ARRAY[$i]}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")
    api_call PUT "/api/exercises/${EXERCISE_ID}/phases/${PHASE_ID_ARRAY[$i]}" \
      "{\"name\": ${phase_name}, \"phase_order\": ${PHASE_ORDER_ARRAY[$i]}, \"start_offset_min\": ${start}, \"end_offset_min\": ${end}}"
    check_status "Update phase offset"
  fi
done
log_ok "${PHASE_COUNT} phases configured with time offsets"

# ─────────────────────────────────────────────
# Step 7: Create Injects (15 injects)
# ─────────────────────────────────────────────
progress "Création injects"

INJECTS_CREATED=0
TECHNICAL_COUNT=0
BUSINESS_COUNT=0

create_inject() {
  api_call POST "/api/injects" "$1"
  check_status "Create inject"
  INJECTS_CREATED=$((INJECTS_CREATED + 1))
}

# Helper: get phase ID by index (0-based)
pid() { echo "${PHASE_ID_ARRAY[$1]}"; }

# ── INJECT 1: Alerte SIEM (TECHNICAL) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Alerte SIEM - Lateral Movement détecté\",
  \"description\": \"Le SOC détecte une alerte critique de lateral movement sur le segment serveurs de Toulouse.\",
  \"type\": \"system\",
  \"data_format\": \"text\",
  \"content\": {\"body\": \"ALERTE SIEM CRITIQUE — Règle 'Lateral Movement via PsExec/WMI' déclenchée. Source: SRV-TOUL-DC01 (10.2.1.10). Destinations multiples: SRV-TOUL-APP01, SRV-TOUL-FS03, SRV-TOUL-MES01. 47 connexions anormales depuis 06:12 UTC via comptes de service svc_backup, svc_deploy. Volume DNS sortant: +300% sur 24h (C2 probable). Priorité: P1.\"},
  \"time_offset\": 0,
  \"phase_id\": $(pid 0),
  \"timeline_type\": \"technical\",
  \"pressure_level\": \"high\",
  \"inject_category\": \"incident\",
  \"channel\": \"siem\",
  \"target_audience\": \"dsi\",
  \"tested_competence\": \"technical\"
}"
TECHNICAL_COUNT=$((TECHNICAL_COUNT + 1))

# ── INJECT 2: Confirmation propagation (TECHNICAL) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Propagation confirmée - Chiffrement en cours\",
  \"description\": \"Le ransomware BlackCat commence le chiffrement sur les serveurs de Toulouse.\",
  \"type\": \"system\",
  \"data_format\": \"text\",
  \"content\": {\"body\": \"ALERTE CRITIQUE — Processus de chiffrement détecté sur 12 serveurs du site de Toulouse. Extension .alphv ajoutée aux fichiers. Serveurs impactés: SRV-TOUL-FS01/02/03, SRV-TOUL-APP01/02, SRV-TOUL-DB01. Le contrôleur de domaine SRV-TOUL-DC01 montre des signes de compromission. Les partages réseau sont progressivement inaccessibles.\"},
  \"time_offset\": 20,
  \"phase_id\": $(pid 1),
  \"timeline_type\": \"technical\",
  \"pressure_level\": \"critical\",
  \"inject_category\": \"incident\",
  \"channel\": \"siem\",
  \"target_audience\": \"dsi\",
  \"tested_competence\": \"technical\"
}"
TECHNICAL_COUNT=$((TECHNICAL_COUNT + 1))

# ── INJECT 3: Demande de rançon (BUSINESS) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Demande de rançon BlackCat/ALPHV\",
  \"description\": \"Une note de rançon apparaît sur les serveurs chiffrés.\",
  \"type\": \"mail\",
  \"data_format\": \"text\",
  \"content\": {\"from\": \"BlackCat/ALPHV Ransomware Group\", \"to\": \"Direction Duval Industries\", \"subject\": \"YOUR NETWORK HAS BEEN COMPROMISED\", \"body\": \"Duval Industries - Your network has been penetrated. We have encrypted your critical systems and exfiltrated 200GB of sensitive data including: technical blueprints (Airbus contracts), HR records (4500 employees), financial data. Payment required: 2.5M USD in Bitcoin within 48 hours. Proof of data: [link to leak site preview]. Contact: alphv-support@onion.link. If payment is not received, all data will be published on our leak site and sent to your competitors and clients.\"},
  \"time_offset\": 25,
  \"phase_id\": $(pid 1),
  \"timeline_type\": \"business\",
  \"pressure_level\": \"critical\",
  \"inject_category\": \"incident\",
  \"channel\": \"mail\",
  \"target_audience\": \"direction\",
  \"tested_competence\": \"arbitration\"
}"
BUSINESS_COUNT=$((BUSINESS_COUNT + 1))

# ── INJECT 4: Activation cellule de crise (BUSINESS) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Activation de la cellule de crise\",
  \"description\": \"Le DG demande l'activation immédiate de la cellule de crise.\",
  \"type\": \"decision\",
  \"data_format\": \"text\",
  \"content\": {\"body\": \"DÉCISION REQUISE — Le Directeur Général demande l'activation immédiate de la cellule de crise. Points à arbitrer : (1) Convocation des membres - qui participe ? (2) Localisation - salle de crise siège ou Teams ? (3) Fréquence des points de situation. (4) Le RSSI est à Bordeaux - le faire revenir ou participer à distance ? (5) Faut-il informer le conseil d'administration ?\"},
  \"time_offset\": 50,
  \"phase_id\": $(pid 3),
  \"timeline_type\": \"business\",
  \"pressure_level\": \"high\",
  \"inject_category\": \"decision\",
  \"channel\": \"phone\",
  \"target_audience\": \"direction\",
  \"tested_competence\": \"coordination\"
}"
BUSINESS_COUNT=$((BUSINESS_COUNT + 1))

# ── INJECT 5: Vérification sauvegardes (TECHNICAL) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Rapport sauvegardes - Intégrité compromise\",
  \"description\": \"L'équipe backup découvre que les sauvegardes du site de Toulouse sont partiellement corrompues.\",
  \"type\": \"system\",
  \"data_format\": \"text\",
  \"content\": {\"body\": \"RAPPORT BACKUP URGENT — Vérification intégrité des sauvegardes site Toulouse : Veeam Backup Repository TOUL-BKP01 : dernière sauvegarde intègre remonte à J-16. Les sauvegardes des 15 derniers jours contiennent un agent dormant (backdoor détectée dans le service VSS). Sauvegardes off-site (tape) : OK mais datent de J-30. Sauvegardes sites Bordeaux et Nantes : intègres, non compromises. Estimation RPO réel : 30 jours pour Toulouse.\"},
  \"time_offset\": 70,
  \"phase_id\": $(pid 4),
  \"timeline_type\": \"technical\",
  \"pressure_level\": \"high\",
  \"inject_category\": \"technical\",
  \"channel\": \"mail\",
  \"target_audience\": \"dsi\",
  \"tested_competence\": \"technical\"
}"
TECHNICAL_COUNT=$((TECHNICAL_COUNT + 1))

# ── INJECT 6: Notification ANSSI (BUSINESS) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Obligation notification ANSSI - OIV\",
  \"description\": \"Le RSSI rappelle l'obligation de notification ANSSI en tant qu'OIV.\",
  \"type\": \"mail\",
  \"data_format\": \"text\",
  \"content\": {\"from\": \"RSSI - Marc Dubois\", \"to\": \"Cellule de crise\", \"subject\": \"URGENT : Obligation notification ANSSI + CNIL\", \"body\": \"En tant qu'OIV (Opérateur d'Importance Vitale - secteur aéronautique), nous avons l'obligation légale de notifier l'ANSSI dans les plus brefs délais (article L.1332-6-2 du Code de la Défense). Par ailleurs, si des données personnelles sont concernées (ce qui semble être le cas avec les données RH exfiltrées), notification CNIL obligatoire sous 72h (RGPD art. 33). Je recommande : (1) Appeler le CERT-FR maintenant, (2) Préparer la notification CNIL, (3) Contacter notre DPO et notre avocat cyber.\"},
  \"time_offset\": 55,
  \"phase_id\": $(pid 3),
  \"timeline_type\": \"business\",
  \"pressure_level\": \"high\",
  \"inject_category\": \"legal\",
  \"channel\": \"mail\",
  \"target_audience\": \"direction\",
  \"tested_competence\": \"governance\"
}"
BUSINESS_COUNT=$((BUSINESS_COUNT + 1))

# ── INJECT 7: Tweet viral (BUSINESS) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Tweet viral - Fuite information\",
  \"description\": \"Un employé poste un tweet mentionnant des problèmes informatiques majeurs chez Duval Industries.\",
  \"type\": \"twitter\",
  \"data_format\": \"text\",
  \"content\": {\"author\": \"@music_tech_insider\", \"handle\": \"music_tech_insider\", \"body\": \"Gros problème chez #DuvalIndustries aujourd'hui. Tous les systèmes informatiques sont down depuis ce matin. Les collègues de Toulouse disent que c'est une cyberattaque. La production est à l'arrêt total. Ça sent le ransomware... #cybersecurity #ransomware\", \"verified\": false},
  \"time_offset\": 80,
  \"phase_id\": $(pid 4),
  \"timeline_type\": \"business\",
  \"pressure_level\": \"medium\",
  \"inject_category\": \"media\",
  \"channel\": \"social_network\",
  \"target_audience\": \"com\",
  \"tested_competence\": \"communication\"
}"
BUSINESS_COUNT=$((BUSINESS_COUNT + 1))

# ── INJECT 8: Isolation réseau OT (TECHNICAL) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Décision isolation réseau OT/SCADA\",
  \"description\": \"Le responsable production demande une décision urgente sur l'isolation du réseau OT.\",
  \"type\": \"decision\",
  \"data_format\": \"text\",
  \"content\": {\"body\": \"DÉCISION TECHNIQUE URGENTE — Le ransomware se rapproche du réseau OT (passerelle IT/OT compromise sur 192.168.100.0/24). Le responsable production demande : faut-il couper la passerelle IT/OT maintenant ? Impact : arrêt immédiat de la production MES sur le site de Toulouse. Commande Airbus en cours (deadline lundi). Coût estimé d'un arrêt de production : 2M€/jour. Mais si le ransomware atteint les automates SCADA Schneider EcoStruxure, le coût de remise en état serait de 10-15M€ et 3-6 mois.\"},
  \"time_offset\": 90,
  \"phase_id\": $(pid 4),
  \"timeline_type\": \"technical\",
  \"pressure_level\": \"critical\",
  \"inject_category\": \"decision\",
  \"channel\": \"phone\",
  \"target_audience\": \"dsi\",
  \"tested_competence\": \"arbitration\"
}"
TECHNICAL_COUNT=$((TECHNICAL_COUNT + 1))

# ── INJECT 9: Flash info TV (BUSINESS) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Flash info BFM Business - Cyberattaque Duval\",
  \"description\": \"BFM Business diffuse un flash info sur la cyberattaque présumée chez Duval Industries.\",
  \"type\": \"tv\",
  \"data_format\": \"text\",
  \"content\": {\"headline\": \"FLASH — Cyberattaque présumée chez Duval Industries\", \"body\": \"Selon nos informations, le groupe aéronautique Duval Industries serait victime d'une cyberattaque de grande ampleur depuis ce matin. La production serait à l'arrêt sur le site de Toulouse. Le groupe, fournisseur stratégique d'Airbus et Safran, n'a pas encore communiqué officiellement. L'action Duval Industries recule de 3.2% à la Bourse de Paris. Nous tenterons de joindre la direction dans les prochaines minutes.\", \"channel_name\": \"BFM Business\", \"reporter\": \"Sophie Martin\"},
  \"time_offset\": 130,
  \"phase_id\": $(pid 5),
  \"timeline_type\": \"business\",
  \"pressure_level\": \"high\",
  \"inject_category\": \"media\",
  \"channel\": \"tv\",
  \"target_audience\": \"com\",
  \"tested_competence\": \"communication\"
}"
BUSINESS_COUNT=$((BUSINESS_COUNT + 1))

# ── INJECT 10: Appel client Airbus (BUSINESS) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Appel Airbus - Inquiétude livraison\",
  \"description\": \"Le directeur achats Airbus appelle pour s'enquérir de la situation et de l'impact sur les livraisons.\",
  \"type\": \"mail\",
  \"data_format\": \"text\",
  \"content\": {\"from\": \"Jean-Pierre Marchand - Dir. Achats Airbus\", \"to\": \"Direction Commerciale Duval Industries\", \"subject\": \"URGENT - Impact incident sur livraisons programme A320neo\", \"body\": \"Suite aux informations parues dans la presse, nous sommes très préoccupés par la situation chez Duval Industries. Nous avons besoin de réponses immédiates : (1) La livraison du lot 847-B (composants train d'atterrissage A320neo) prévue lundi est-elle maintenue ? (2) Les plans techniques confidentiels que nous vous avons transmis sont-ils compromis ? (3) Quelles mesures de sécurité avez-vous mises en place ? Je vous rappelle les clauses de notre contrat-cadre (art. 12.3) concernant la notification d'incidents de sécurité. Merci de nous répondre avant 17h aujourd'hui.\"},
  \"time_offset\": 140,
  \"phase_id\": $(pid 5),
  \"timeline_type\": \"business\",
  \"pressure_level\": \"high\",
  \"inject_category\": \"information\",
  \"channel\": \"mail\",
  \"target_audience\": \"direction\",
  \"tested_competence\": \"communication\"
}"
BUSINESS_COUNT=$((BUSINESS_COUNT + 1))

# ── INJECT 11: Plan de remédiation (TECHNICAL) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Proposition plan de remédiation technique\",
  \"description\": \"L'équipe technique soumet un plan de remédiation en 4 phases.\",
  \"type\": \"mail\",
  \"data_format\": \"text\",
  \"content\": {\"from\": \"Équipe SOC / Infrastructure\", \"to\": \"Cellule de crise\", \"subject\": \"Plan de remédiation technique - v1\", \"body\": \"Plan de remédiation proposé : PHASE 1 (J0-J1) Endiguement : Isolation complète site Toulouse, reset de tous les comptes AD compromis, déploiement EDR CrowdStrike d'urgence. PHASE 2 (J1-J3) Éradication : Forensique sur les 12 serveurs chiffrés, nettoyage du contrôleur de domaine SRV-TOUL-DC01, suppression des backdoors identifiées. PHASE 3 (J3-J7) Restauration : Rebuild AD depuis sauvegarde saine (J-30), restauration progressive des services critiques (MES Siemens, SAP, Exchange). PHASE 4 (J7-J14) Durcissement : Segmentation réseau IT/OT renforcée, MFA sur tous les comptes à privilèges, monitoring SOC Splunk 24/7. Estimation coût total : 800K-1.2M€. Besoin de validation pour lancer Phase 1 immédiatement.\"},
  \"time_offset\": 150,
  \"phase_id\": $(pid 6),
  \"timeline_type\": \"technical\",
  \"pressure_level\": \"medium\",
  \"inject_category\": \"technical\",
  \"channel\": \"mail\",
  \"target_audience\": \"dsi\",
  \"tested_competence\": \"technical\"
}"
TECHNICAL_COUNT=$((TECHNICAL_COUNT + 1))

# ── INJECT 12: Communiqué de presse (BUSINESS) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Validation communiqué de presse officiel\",
  \"description\": \"Le service communication soumet un projet de communiqué de presse pour validation.\",
  \"type\": \"decision\",
  \"data_format\": \"text\",
  \"content\": {\"body\": \"VALIDATION REQUISE — Le service communication propose le communiqué suivant : 'Duval Industries confirme avoir été la cible d'un incident de cybersécurité détecté ce jour. Les équipes techniques sont pleinement mobilisées. Par mesure de précaution, certains systèmes ont été isolés. La production est temporairement ralentie sur un site. Les autorités compétentes ont été notifiées. Duval Industries prend cet événement très au sérieux et mettra tout en œuvre pour rétablir une situation normale dans les meilleurs délais.' Questions : (1) Mentionner le ransomware ? (2) Mentionner l'exfiltration de données ? (3) Donner un délai de reprise ? (4) Quel porte-parole (DG ou Dircom) ?\"},
  \"time_offset\": 160,
  \"phase_id\": $(pid 6),
  \"timeline_type\": \"business\",
  \"pressure_level\": \"high\",
  \"inject_category\": \"decision\",
  \"channel\": \"mail\",
  \"target_audience\": \"com\",
  \"tested_competence\": \"communication\"
}"
BUSINESS_COUNT=$((BUSINESS_COUNT + 1))

# ── INJECT 13: Reprise systèmes critiques (TECHNICAL) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Début reprise systèmes critiques\",
  \"description\": \"L'équipe infra commence la restauration des systèmes critiques par ordre de priorité RTO.\",
  \"type\": \"system\",
  \"data_format\": \"text\",
  \"content\": {\"body\": \"RAPPORT RESTAURATION — Début de la reprise des systèmes par priorité RTO : 1. Active Directory (RTO 2h) : Rebuild DC propre SRV-PAR-DC01 en cours depuis sauvegarde J-30. ETA: 3h. 2. Production MES Siemens (RTO 4h) : En attente du rebuild AD. Réseau OT 192.168.100.0/24 isolé et vérifié — aucun artefact malveillant détecté sur les automates SCADA. 3. SAP S/4HANA (RTO 8h) : Base de données intègre (réplica Bordeaux SRV-BDX-DB01). Restauration possible dès que AD opérationnel. 4. Exchange (RTO 12h) : Messagerie cloud M365 non impactée, migration temporaire possible. Le site de Nantes est pleinement opérationnel et peut absorber 40% de la production Toulouse en mode dégradé.\"},
  \"time_offset\": 200,
  \"phase_id\": $(pid 7),
  \"timeline_type\": \"technical\",
  \"pressure_level\": \"medium\",
  \"inject_category\": \"technical\",
  \"channel\": \"mail\",
  \"target_audience\": \"dsi\",
  \"tested_competence\": \"technical\"
}"
TECHNICAL_COUNT=$((TECHNICAL_COUNT + 1))

# ── INJECT 14: Notification CNIL (BUSINESS) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Deadline notification CNIL - 72h\",
  \"description\": \"Le DPO alerte sur l'approche du deadline de 72h pour la notification CNIL.\",
  \"type\": \"mail\",
  \"data_format\": \"text\",
  \"content\": {\"from\": \"DPO - Claire Fontaine\", \"to\": \"Cellule de crise\", \"subject\": \"RAPPEL URGENT : Notification CNIL - deadline dimanche 14h\", \"body\": \"Rappel : le délai de 72h pour la notification CNIL expire dimanche à 14h00. L'exfiltration confirmée de 200 Go incluant des données RH (4500 fiches employés avec données personnelles) constitue une violation de données au sens du RGPD art. 33. La notification initiale a été préparée et requiert votre validation. Si les données clients Airbus sont également concernées, une notification séparée aux personnes concernées (art. 34) sera nécessaire. Le formulaire de notification CNIL est prêt — j'attends votre feu vert pour soumission.\"},
  \"time_offset\": 170,
  \"phase_id\": $(pid 6),
  \"timeline_type\": \"business\",
  \"pressure_level\": \"high\",
  \"inject_category\": \"legal\",
  \"channel\": \"mail\",
  \"target_audience\": \"legal\",
  \"tested_competence\": \"governance\"
}"
BUSINESS_COUNT=$((BUSINESS_COUNT + 1))

# ── INJECT 15: Bilan et clôture (BUSINESS) ──
create_inject "{
  \"exercise_id\": ${EXERCISE_ID},
  \"title\": \"Point de situation final - Clôture de crise\",
  \"description\": \"Le directeur de crise fait le point final avant la clôture de la cellule de crise.\",
  \"type\": \"system\",
  \"data_format\": \"text\",
  \"content\": {\"body\": \"POINT DE SITUATION FINAL (T+4h) — Endiguement : Le ransomware est contenu. Tous les systèmes compromis sont isolés. Aucune propagation vers les sites de Bordeaux et Nantes. Restauration : AD en cours de rebuild (ETA 2h). Production Nantes prend le relais à 40% de capacité. SAP opérationnel via réplica Bordeaux. Juridique : ANSSI notifié (dossier CERT-FR-2024-xxxx). Notification CNIL soumise. Airbus informé officiellement. Communication : Communiqué de presse diffusé. Porte-parole identifié pour les sollicitations médias. Actions en cours : Investigation forensique (prestataire ANSSI). Évaluation assurance cyber. Analyse d'impact complète. PROPOSITION : passage en mode suivi post-crise, cellule de crise désactivée, points quotidiens pendant 7 jours.\"},
  \"time_offset\": 230,
  \"phase_id\": $(pid 8),
  \"timeline_type\": \"business\",
  \"pressure_level\": \"low\",
  \"inject_category\": \"information\",
  \"channel\": \"mail\",
  \"target_audience\": \"all\",
  \"tested_competence\": \"coordination\"
}"
BUSINESS_COUNT=$((BUSINESS_COUNT + 1))

log_ok "${INJECTS_CREATED} injects created (${TECHNICAL_COUNT} TECHNICAL, ${BUSINESS_COUNT} BUSINESS)"

# Mark timeline as configured
api_call PUT "/api/exercises/${EXERCISE_ID}" '{"timeline_configured": true}'
check_status "Mark timeline configured"
log_ok "Timeline marked as configured"

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
progress "Terminé"

echo ""
echo "════════════════════════════════════════════════════════"
echo ""
log_ok "API Key created: ${API_KEY:0:12}...${API_KEY: -4}"
log_ok "Organization configured: Duval Industries (10 IT context fields)"
log_ok "Exercise created: ${EXERCISE_NAME} (id=${EXERCISE_ID})"
log_ok "Scenario configured"
log_ok "${AXES_CREATED} escalation axes created"
log_ok "${PHASE_COUNT} phases configured with time offsets"
log_ok "${INJECTS_CREATED} injects created (${TECHNICAL_COUNT} TECHNICAL, ${BUSINESS_COUNT} BUSINESS)"
echo ""
echo -e "${GREEN}Demo environment ready!${NC}"
echo "  Dashboard: ${APP_URL%/}/dashboard"
echo "  Exercise:  ${APP_URL%/}/exercises/${EXERCISE_ID}"
echo ""
