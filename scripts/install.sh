#!/usr/bin/env bash
set -e

# n0x installer - One command to rule them all
# Usage: curl -fsSL https://n0x.sh/install.sh | sh

INSTALL_DIR="${HOME}/.local/bin"
N0X_HOME="${HOME}/.n0x"
REPO="ixchio/n0x-cli"
VERSION="${N0X_VERSION:-latest}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_banner() {
  echo ""
  echo -e "${GREEN}🌿 n0x installer${NC}"
  echo -e "${CYAN}Claude Code quality for 4GB systems${NC}"
  echo ""
}

detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Darwin) PLATFORM="darwin" ;;
    Linux)  PLATFORM="linux" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="win32" ;;
    *)
      echo -e "${RED}✗ Unsupported OS: $OS${NC}"
      echo "Supported: macOS, Linux, Windows"
      exit 1
      ;;
  esac

  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *)
      echo -e "${RED}✗ Unsupported architecture: $ARCH${NC}"
      echo "Supported: x64, arm64"
      exit 1
      ;;
  esac

  echo -e "${GREEN}✓${NC} Platform: ${PLATFORM}-${ARCH}"
}

check_dependencies() {
  # Check for curl or wget
  if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
    echo -e "${RED}✗ Neither curl nor wget found${NC}"
    echo "Please install curl: sudo apt install curl"
    exit 1
  fi

  # Check for tar
  if ! command -v tar &> /dev/null; then
    echo -e "${RED}✗ tar not found${NC}"
    echo "Please install tar: sudo apt install tar"
    exit 1
  fi

  echo -e "${GREEN}✓${NC} Dependencies satisfied"
}

get_latest_version() {
  if [ "$VERSION" = "latest" ]; then
    echo -e "${CYAN}Fetching latest version...${NC}"
    if command -v curl &> /dev/null; then
      VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
    else
      VERSION=$(wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
    fi

    if [ -z "$VERSION" ]; then
      echo -e "${YELLOW}⚠ Could not fetch latest version, using v0.5.0${NC}"
      VERSION="v0.5.0"
    fi
  fi

  echo -e "${GREEN}✓${NC} Version: ${VERSION}"
}

download_release() {
  DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/n0x-${PLATFORM}-${ARCH}.tar.gz"
  TEMP_FILE="/tmp/n0x-${PLATFORM}-${ARCH}.tar.gz"

  echo ""
  echo -e "${CYAN}Downloading n0x ${VERSION}...${NC}"
  echo -e "${BLUE}${DOWNLOAD_URL}${NC}"
  echo ""

  if command -v curl &> /dev/null; then
    curl -fL --progress-bar "$DOWNLOAD_URL" -o "$TEMP_FILE"
  else
    wget --show-progress -q -O "$TEMP_FILE" "$DOWNLOAD_URL"
  fi

  if [ ! -f "$TEMP_FILE" ]; then
    echo -e "${RED}✗ Download failed${NC}"
    exit 1
  fi

  echo -e "${GREEN}✓${NC} Downloaded"
}

extract_and_install() {
  echo ""
  echo -e "${CYAN}Installing to ${INSTALL_DIR}...${NC}"

  # Create directories
  mkdir -p "$INSTALL_DIR"
  mkdir -p "${N0X_HOME}/bin"

  # Extract
  tar -xzf "$TEMP_FILE" -C /tmp

  # Install n0x binary
  mv /tmp/n0x "$INSTALL_DIR/n0x"
  chmod +x "$INSTALL_DIR/n0x"

  # Install bundled llama-server
  if [ -f "/tmp/llama-server" ]; then
    mv /tmp/llama-server "${N0X_HOME}/bin/llama-server"
    chmod +x "${N0X_HOME}/bin/llama-server"
    echo -e "${GREEN}✓${NC} Bundled llama-server installed"
  else
    echo -e "${YELLOW}⚠${NC} llama-server not bundled, will need system installation"
  fi

  # Cleanup
  rm -f "$TEMP_FILE"

  echo -e "${GREEN}✓${NC} Installed to ${INSTALL_DIR}/n0x"
}

add_to_path() {
  # Check if already in PATH
  if echo "$PATH" | grep -q "${INSTALL_DIR}"; then
    echo -e "${GREEN}✓${NC} Already in PATH"
    return
  fi

  echo ""
  echo -e "${CYAN}Adding to PATH...${NC}"

  # Detect shell
  SHELL_RC=""
  if [ -n "$BASH_VERSION" ]; then
    SHELL_RC="${HOME}/.bashrc"
  elif [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="${HOME}/.zshrc"
  elif [ -f "${HOME}/.bashrc" ]; then
    SHELL_RC="${HOME}/.bashrc"
  elif [ -f "${HOME}/.zshrc" ]; then
    SHELL_RC="${HOME}/.zshrc"
  fi

  if [ -n "$SHELL_RC" ]; then
    echo "" >> "$SHELL_RC"
    echo "# n0x - local-first coding agent" >> "$SHELL_RC"
    echo 'export PATH="'"${INSTALL_DIR}"':$PATH"' >> "$SHELL_RC"
    echo -e "${GREEN}✓${NC} Added to ${SHELL_RC}"
    echo -e "${YELLOW}⚠${NC} Run: ${CYAN}source ${SHELL_RC}${NC} or restart your terminal"
  else
    echo -e "${YELLOW}⚠${NC} Could not detect shell config"
    echo "Add this to your shell RC file:"
    echo -e "${CYAN}export PATH=\"${INSTALL_DIR}:\$PATH\"${NC}"
  fi
}

verify_installation() {
  echo ""
  echo -e "${CYAN}Verifying installation...${NC}"

  if ! command -v n0x &> /dev/null; then
    # Try direct path
    if [ -x "${INSTALL_DIR}/n0x" ]; then
      echo -e "${GREEN}✓${NC} Binary installed (restart terminal to use 'n0x' command)"
    else
      echo -e "${RED}✗ Installation verification failed${NC}"
      exit 1
    fi
  else
    VERSION_OUTPUT=$(n0x --version 2>&1 || echo "unknown")
    echo -e "${GREEN}✓${NC} n0x installed: ${VERSION_OUTPUT}"
  fi
}

show_next_steps() {
  echo ""
  echo -e "${GREEN}✨ Installation complete!${NC}"
  echo ""
  echo -e "${CYAN}Next steps:${NC}"
  echo ""
  echo "  1. ${YELLOW}Restart your terminal${NC} or run:"
  echo -e "     ${CYAN}source ~/.bashrc${NC}  # or ~/.zshrc"
  echo ""
  echo "  2. ${YELLOW}Navigate to your project:${NC}"
  echo -e "     ${CYAN}cd ~/my-project${NC}"
  echo ""
  echo "  3. ${YELLOW}Start coding:${NC}"
  echo -e "     ${CYAN}n0x run \"add authentication\"${NC}"
  echo ""
  echo -e "${BLUE}First run will auto-setup (download model, start server)${NC}"
  echo ""
  echo "Documentation: https://github.com/${REPO}"
  echo ""
}

# Main installation flow
main() {
  print_banner
  detect_platform
  check_dependencies
  get_latest_version
  download_release
  extract_and_install
  add_to_path
  verify_installation
  show_next_steps
}

# Run if not sourced
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
