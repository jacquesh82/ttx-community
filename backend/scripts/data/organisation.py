"""Organisation seed data — demo company for TTX demonstrations.

Populates TenantConfiguration with realistic identity, IT context,
and BIA data for a fictional French industrial company.
"""
import json

from sqlalchemy import select

from app.database import async_session_factory
from app.models import Tenant, TenantConfiguration


# ─────────────────────────────────────────────
# Demo data
# ─────────────────────────────────────────────

IDENTITY = {
    "organization_name": "Duval Industries",
    "organization_sector": "Industrie / manufacture",
    "organization_description": (
        "Groupe industriel français spécialisé dans la fabrication de composants "
        "électroniques pour l'automobile et l'aéronautique. "
        "1 200 collaborateurs répartis sur 3 sites en France."
    ),
    "organization_reference_url": "https://www.duval-industries.fr",
    "organization_keywords": "électronique, automobile, aéronautique, composants, industrie, IoT",
    "organization_tech_stack": "SAP ERP, Microsoft 365, Azure AD, VMware vSphere, Fortinet, Veeam",
}

IT_CONTEXT = {
    "windows_domain": "corp.duval-industries.local",
    "public_domain": "duval-industries.fr",
    "mail_domain": "duval-industries.fr",
    "internal_ip_ranges": "10.1.0.0/16\n10.2.0.0/16\n10.3.0.0/16",
    "dmz_ip_ranges": "172.16.1.0/24\n172.16.2.0/24",
    "domain_controllers": "DC01.corp.duval-industries.local\nDC02.corp.duval-industries.local",
    "server_naming_examples": "SRV-PAR-APP01\nSRV-LYO-DB01\nSRV-TLS-WEB01",
    "technological_dependencies": (
        "SAP S/4HANA (ERP)\n"
        "Microsoft Exchange Online\n"
        "Citrix Virtual Apps\n"
        "Splunk (SIEM)\n"
        "CrowdStrike Falcon (EDR)"
    ),
    "cloud_providers": (
        "Microsoft Azure (IaaS/PaaS principal)\n"
        "AWS S3 (stockage archives)\n"
        "OVHcloud (hébergement site vitrine)"
    ),
    "critical_applications": (
        "SAP S/4HANA — ERP production et logistique\n"
        "MES Wonderware — pilotage chaînes de fabrication\n"
        "Salesforce — CRM et gestion commerciale\n"
        "SharePoint Online — documentation technique\n"
        "Zscaler — sécurité accès internet"
    ),
}

BIA_PROCESSES = [
    {
        "id": "demo-bia-001",
        "process_name": "SAP S/4HANA — ERP",
        "description": "ERP production et logistique — impact financier très élevé",
        "department": "DSI / Production",
        "criticality": "vital",
        "rto_hours": 4,
        "rpo_minutes": 60,
        "mtpd_hours": 12,
        "priority": "P1",
        "operational_impact": True,
        "regulatory_impact": False,
        "financial_impact": "fort",
        "degraded_mode": "Bascule sur procédures manuelles et tableurs de suivi",
        "dependencies_it": ["Azure AD", "Réseau WAN inter-sites"],
        "dependencies_external": ["SAP Support", "Microsoft Azure"],
    },
    {
        "id": "demo-bia-002",
        "process_name": "MES Wonderware — Production",
        "description": "Pilotage des chaînes de fabrication",
        "department": "Production",
        "criticality": "vital",
        "rto_hours": 2,
        "rpo_minutes": 30,
        "mtpd_hours": 8,
        "priority": "P1",
        "operational_impact": True,
        "regulatory_impact": True,
        "financial_impact": "fort",
        "degraded_mode": "Pilotage manuel des lignes avec fiches papier",
        "dependencies_it": ["Réseau OT", "Serveurs SCADA"],
        "dependencies_external": ["AVEVA Support"],
    },
    {
        "id": "demo-bia-003",
        "process_name": "Messagerie Exchange Online",
        "description": "Communication interne et externe",
        "department": "DSI",
        "criticality": "critique",
        "rto_hours": 8,
        "rpo_minutes": 240,
        "mtpd_hours": 24,
        "priority": "P2",
        "operational_impact": True,
        "regulatory_impact": False,
        "financial_impact": "moyen",
        "degraded_mode": "Communication par téléphone et messagerie instantanée Teams",
        "dependencies_it": ["Azure AD", "DNS public"],
        "dependencies_external": ["Microsoft 365"],
    },
    {
        "id": "demo-bia-004",
        "process_name": "CRM Salesforce",
        "description": "Gestion commerciale et relation client",
        "department": "Direction commerciale",
        "criticality": "moyen",
        "rto_hours": 24,
        "rpo_minutes": 720,
        "mtpd_hours": 72,
        "priority": "P3",
        "operational_impact": False,
        "regulatory_impact": False,
        "financial_impact": "moyen",
        "degraded_mode": "Suivi commercial via tableurs partagés",
        "dependencies_it": ["Accès internet"],
        "dependencies_external": ["Salesforce"],
    },
    {
        "id": "demo-bia-005",
        "process_name": "Site web vitrine",
        "description": "Présence web publique",
        "department": "Communication",
        "criticality": "faible",
        "rto_hours": 48,
        "rpo_minutes": 1440,
        "mtpd_hours": 168,
        "priority": "P4",
        "operational_impact": False,
        "regulatory_impact": False,
        "financial_impact": "faible",
        "degraded_mode": "Page de maintenance statique",
        "dependencies_it": [],
        "dependencies_external": ["OVHcloud"],
    },
    {
        "id": "demo-bia-006",
        "process_name": "Paie & RH",
        "description": "Gestion de la paie et des ressources humaines",
        "department": "Ressources humaines",
        "criticality": "moyen",
        "rto_hours": 72,
        "rpo_minutes": 1440,
        "mtpd_hours": 168,
        "priority": "P3",
        "operational_impact": False,
        "regulatory_impact": True,
        "financial_impact": "moyen",
        "degraded_mode": "Report de la paie au cycle suivant, déclarations manuelles",
        "dependencies_it": ["SAP HCM", "Réseau interne"],
        "dependencies_external": ["Prestataire paie externalisé"],
    },
]


# ─────────────────────────────────────────────
# Seed function
# ─────────────────────────────────────────────

async def seed_demo_organisation(tenant: Tenant, *, force: bool = False) -> None:
    """Populate Organisation fields on the tenant configuration.

    By default, only fills empty/null fields (idempotent).
    With ``force=True``, overwrites existing values.
    """
    print("\n🏢 Seed données Organisation démo...")

    all_fields = {**IDENTITY, **IT_CONTEXT, "bia_processes": json.dumps(BIA_PROCESSES, ensure_ascii=False)}

    async with async_session_factory() as session:
        result = await session.execute(
            select(TenantConfiguration).where(TenantConfiguration.tenant_id == tenant.id)
        )
        config = result.scalar_one_or_none()

        if not config:
            config = TenantConfiguration(
                tenant_id=tenant.id,
                organization_name=tenant.name or "Organisation",
            )
            session.add(config)
            await session.flush()

        changed = 0
        skipped = 0

        for field, value in all_fields.items():
            current = getattr(config, field, None)
            if force or not current:
                setattr(config, field, value)
                changed += 1
            else:
                skipped += 1

        if changed:
            await session.commit()
            print(f"  ✅ {changed} champ(s) mis à jour" + (f", {skipped} conservé(s)" if skipped else ""))
        else:
            print("  ⏭️  Tous les champs sont déjà renseignés (utiliser --force pour écraser)")
