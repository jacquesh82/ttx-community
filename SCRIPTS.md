# TTX Platform - Scripts Documentation

This document provides comprehensive information about the installation and management scripts for the TTX Platform.

## Overview

The TTX Platform includes three main scripts to help you manage your installation:

1. **Factory Reset Script** (`scripts/reset_factory.sh`) - Completely resets the platform
2. **Installation Script** (`scripts/install.sh`) - Full installation and initialization
3. **Quick Start Script** (`scripts/quick_start.sh`) - Fast development startup

## Prerequisites

Before using any of these scripts, ensure you have:

- **Docker** installed and running
- **Docker Compose** installed (either `docker-compose` or `docker compose`)
- Sufficient disk space for Docker images and volumes
- Network access for downloading Docker images

## Script Details

### 1. Factory Reset Script

**File**: `scripts/reset_factory.sh`

**Purpose**: Completely resets the TTX Platform to a clean state by removing all containers, images, volumes, and temporary files.

**When to Use**:
- Starting fresh after development issues
- Before deploying to a new environment
- When you want to completely wipe all data and start over
- Troubleshooting persistent issues

**Usage**:
```bash
# Basic factory reset (with confirmation)
./scripts/reset_factory.sh

# Skip confirmation prompts
./scripts/reset_factory.sh --force

# Keep Docker volumes (database, media, logs)
./scripts/reset_factory.sh --keep-volumes

# Show help
./scripts/reset_factory.sh --help
```

**What It Does**:
1. Stops all running containers
2. Removes all containers
3. Removes all Docker images for the project
4. Removes all Docker volumes (unless `--keep-volumes` is used)
5. Cleans up temporary files
6. Verifies cleanup completion

**⚠️ Warning**: This script permanently deletes all data. Use with caution!

### 2. Installation Script

**File**: `scripts/install.sh`

**Purpose**: Complete installation and initialization of the TTX Platform with default configuration.

**When to Use**:
- Initial setup of the platform
- After running the factory reset script
- Setting up a new development or production environment
- When you need a fresh installation with demo data

**Usage**:
```bash
# Basic installation (development mode)
./scripts/install.sh

# Production setup
./scripts/install.sh --production

# Skip Docker image building
./scripts/install.sh --skip-build

# Skip database initialization
./scripts/install.sh --skip-init

# Force re-initialization of existing data
./scripts/install.sh --force-reinit

# Show help
./scripts/install.sh --help
```

**What It Does**:
1. Checks prerequisites (Docker, Docker Compose)
2. Sets up environment configuration (creates `.env` from `.env.example`)
3. Generates secure session secret if needed
4. Builds and starts Docker containers
5. Waits for services to be ready
6. Initializes database with default configuration:
   - **Default Users**: admin, animateur, observateur, participant
   - **Teams Configuration**: Équipe Alpha, Équipe Beta, Cellule de Crise
   - **Empty Inject Bank**: Ready for your scenarios
   - **Welcome Kit**: Initialized with default templates

**Default Configuration**:
- **Environment**: Development (unless `--production` specified)
- **Database**: PostgreSQL with default users and teams
- **Inject Bank**: Empty (ready for scenario creation)
- **Welcome Kit**: Default templates configured

**Default Credentials**:
| Role | Username | Password |
|------|----------|----------|
| Admin | admin | Admin123! |
| Animateur | animateur1 | Anim123! |
| Observateur | observateur1 | Obs123! |
| Participant | participant1 | Part123! |

### 3. Quick Start Script

**File**: `scripts/quick_start.sh`

**Purpose**: Fast startup for development with minimal setup.

**When to Use**:
- Daily development work
- Quick testing of changes
- When you want to start the platform quickly
- Development environment management

**Usage**:
```bash
# Start in development mode
./scripts/quick_start.sh

# Fresh start (removes existing containers)
./scripts/quick_start.sh --fresh

# Start and show logs
./scripts/quick_start.sh --logs

# Production mode
./scripts/quick_start.sh --prod

# Show help
./scripts/quick_start.sh --help
```

**What It Does**:
1. Checks prerequisites
2. Prepares environment (creates `.env` if needed)
3. Optionally removes existing containers (`--fresh`)
4. Starts Docker containers
5. Waits for services to be ready
6. Shows completion information or logs

**Development Features**:
- Hot reload for frontend and backend
- Fast startup times
- Development-friendly configuration

## Access Information

After successful installation, access your TTX Platform at:

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3000
- **API Documentation**: http://localhost:3000/docs

## Environment Configuration

The scripts automatically configure your environment based on the mode:

### Development Mode (Default)
- Environment: `development`
- CORS Origins: `http://localhost:5173,http://localhost:80`
- API URL: `http://localhost:3000`
- WebSocket URL: `ws://localhost:3000`

### Production Mode
- Environment: `production`
- CORS Origins: `https://your-domain.com` (requires manual update)
- API URL: `https://your-domain.com:3000` (requires manual update)
- WebSocket URL: `wss://your-domain.com:3000` (requires manual update)

**Note**: In production mode, you must manually update the domain-specific settings in `.env`.

## Security Considerations

### Session Secret
The scripts automatically generate a secure session secret, but you should:
- Never commit `.env` files to version control
- Use different secrets for different environments
- Regenerate secrets periodically in production

### Default Credentials
**⚠️ Important**: Change default passwords in production:
- Admin password: `Admin123!`
- Animateur password: `Anim123!`
- Observateur password: `Obs123!`
- Participant password: `Part123!`

### CORS Configuration
- Development: Allows localhost origins
- Production: Configure `CORS_ORIGINS` in `.env` for your domain

## Troubleshooting

### Common Issues

**Docker Not Running**:
```bash
# Start Docker daemon
sudo systemctl start docker
```

**Permission Denied**:
```bash
# Make scripts executable
chmod +x scripts/*.sh
```

**Port Already in Use**:
```bash
# Check what's using the ports
sudo lsof -i :3000
sudo lsof -i :5173

# Stop conflicting services or change ports in docker-compose.yml
```

**Database Connection Issues**:
```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs backend

# Restart services
docker-compose restart
```

### Reset and Retry

If you encounter persistent issues:

```bash
# Complete reset
./scripts/reset_factory.sh --force

# Fresh installation
./scripts/install.sh
```

## Development Workflow

### Daily Development
```bash
# Quick start
./scripts/quick_start.sh

# View logs
./scripts/quick_start.sh --logs

# Stop services
docker-compose down
```

### After Code Changes
```bash
# Restart with fresh build
./scripts/quick_start.sh --fresh
```

### Before Committing
```bash
# Ensure clean state
./scripts/reset_factory.sh --force
./scripts/install.sh
# Test functionality
```

## Production Deployment

### Pre-deployment Checklist
1. Run factory reset: `./scripts/reset_factory.sh --force`
2. Install in production mode: `./scripts/install.sh --production`
3. Update `.env` with production values:
   - Change `CORS_ORIGINS` to your domain
   - Update `API_URL` and `WS_URL`
   - Set strong passwords
4. Test thoroughly
5. Configure SSL/TLS for production

### Post-deployment
- Monitor logs: `docker-compose logs -f`
- Set up backups for volumes
- Configure monitoring and alerting
- Document any custom configurations

## Script Permissions

Make sure all scripts are executable:

```bash
chmod +x scripts/*.sh
```

## Support

For issues with these scripts:

1. Check the troubleshooting section above
2. Review Docker and Docker Compose documentation
3. Check the main README.md for additional setup information
4. Review Docker container logs for specific error messages

## File Structure

```
ttx-platform/
├── scripts/
│   ├── reset_factory.sh     # Factory reset script
│   ├── install.sh          # Installation script
│   └── quick_start.sh      # Quick start script
├── docker-compose.yml      # Docker configuration
├── .env.example           # Environment template
└── README.md             # Main documentation
```

This documentation should help you effectively use and manage your TTX Platform installation. For more detailed information about the platform itself, refer to the main README.md file.