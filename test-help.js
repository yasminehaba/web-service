#!/usr/bin/env node

/**
 * Script d'aide pour les tests
 * Usage: npm run test:help
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function printHeader(text) {
  console.log(`\n${colors.bright}${colors.blue}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${text}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════${colors.reset}\n`);
}

function printSection(title) {
  console.log(`${colors.bright}${colors.cyan}▶ ${title}${colors.reset}`);
}

function printCommand(cmd, description) {
  console.log(`  ${colors.yellow}${cmd}${colors.reset}`);
  console.log(`    ${colors.dim}${description}${colors.reset}\n`);
}

printHeader('🧪 Urban Traffic Platform - Guide des Tests');

printSection('Installation');
printCommand(
  'npm run install:all',
  'Installe toutes les dépendances pour les tests'
);

printSection('Exécution des tests');
printCommand(
  'npm run test:all',
  'Exécute tous les tests avec rapport de couverture'
);

printCommand(
  'npm run test:auth',
  'Teste le service d\'authentification'
);

printCommand(
  'npm run test:gateway',
  'Teste le gateway GraphQL'
);

printCommand(
  'npm run test:vehicles',
  'Teste le service de gestion des véhicules'
);

printCommand(
  'npm run test:traffic',
  'Teste le service de gestion du trafic'
);

printCommand(
  'npm run test:incidents',
  'Teste le service de gestion des incidents'
);

printCommand(
  'npm run test:notifications',
  'Teste le service de notifications'
);

printSection('Mode Watch');
printCommand(
  'cd services/auth && npm run test:watch',
  'Exécute les tests du service auth en mode watch'
);

printSection('Rapports');
console.log(`  ${colors.yellow}./coverage/index.html${colors.reset}`);
console.log(`    ${colors.dim}Ouvrir le rapport de couverture dans le navigateur${colors.reset}\n`);

printSection('Structure des tests');
console.log(`  ${colors.dim}Chaque service contient:${colors.reset}`);
console.log(`    - ${colors.cyan}__tests__/${colors.reset} (dossier des tests)`);
console.log(`    - ${colors.cyan}__tests__/setup.js${colors.reset} (configuration)`);
console.log(`    - ${colors.cyan}__tests__/*.test.js${colors.reset} (fichiers de test)`);
console.log(`    - ${colors.cyan}jest.config.js${colors.reset} (configuration Jest)\n`);

printSection('Fichiers de documentation');
console.log(`  ${colors.yellow}TESTS.md${colors.reset}`);
console.log(`    ${colors.dim}Documentation complète des tests${colors.reset}\n`);

printSection('Couverture minimale requise');
console.log(`  ${colors.dim}Tous les services:${colors.reset}`);
console.log(`    - Branches: 50-60%`);
console.log(`    - Functions: 50-60%`);
console.log(`    - Lines: 50-60%`);
console.log(`    - Statements: 50-60%\n`);

printSection('Dépannage');
console.log(`  ${colors.yellow}Jest ne trouve pas les tests${colors.reset}`);
console.log(`    ${colors.dim}→ Vérifier que les fichiers sont dans __tests__/*.test.js${colors.reset}\n`);

console.log(`  ${colors.yellow}Erreur de timeout${colors.reset}`);
console.log(`    ${colors.dim}→ Augmenter le timeout dans jest.config.js${colors.reset}\n`);

console.log(`  ${colors.yellow}Tests échouent${colors.reset}`);
console.log(`    ${colors.dim}→ Vérifier les variables d'environnement dans setup.js${colors.reset}\n`);

printHeader('📚 Pour plus d\'information, consultez TESTS.md');
