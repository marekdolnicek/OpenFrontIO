import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { PlayerActions } from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { TransformHandler } from "../TransformHandler";
import { UIState } from "../UIState";
import { BuildMenu } from "./BuildMenu";
import { ChatIntegration } from "./ChatIntegration";
import { EmojiTable } from "./EmojiTable";
import { Layer } from "./Layer";
import { PlayerActionHandler } from "./PlayerActionHandler";
import { PlayerPanel } from "./PlayerPanel";
import { RadialMenu, RadialMenuConfig } from "./RadialMenu";
import {
  centerButtonElement,
  COLORS,
  MenuElementParams,
  rootMenuElement,
} from "./RadialMenuElements";

import swordIcon from "../../../../resources/images/SwordIconWhite.svg";
import { UnitType } from "../../../core/game/Game";
import { ContextMenuEvent, ContextMenuKeyEvent } from "../../InputHandler";
import {
  boatMenuElement,
  deleteUnitElement,
  infoMenuElement,
} from "./RadialMenuElements";

@customElement("main-radial-menu")
export class MainRadialMenu extends LitElement implements Layer {
  private radialMenu: RadialMenu;

  private playerActionHandler: PlayerActionHandler;
  private chatIntegration: ChatIntegration;

  private clickedTile: TileRef | null = null;

  constructor(
    private eventBus: EventBus,
    private game: GameView,
    private transformHandler: TransformHandler,
    private emojiTable: EmojiTable,
    private buildMenu: BuildMenu,
    private uiState: UIState,
    private playerPanel: PlayerPanel,
    private inputHandler: any, // InputHandler - using any to avoid circular dependency
  ) {
    super();

    const menuConfig: RadialMenuConfig = {
      centerButtonIcon: swordIcon,
      tooltipStyle: `
        .radial-tooltip .cost {
          margin-top: 4px;
          color: ${COLORS.tooltip.cost};
        }
        .radial-tooltip .count {
          color: ${COLORS.tooltip.count};
        }
        .radial-tooltip .shortcut {
          margin-top: 4px;
          color: #88cc88;
          font-weight: bold;
          font-style: italic;
        }
      `,
    };

    this.radialMenu = new RadialMenu(
      this.eventBus,
      rootMenuElement,
      centerButtonElement,
      menuConfig,
    );

    this.playerActionHandler = new PlayerActionHandler(
      this.eventBus,
      this.uiState,
    );

    this.chatIntegration = new ChatIntegration(this.game, this.eventBus);
  }

  init() {
    this.radialMenu.init();
    this.eventBus.on(ContextMenuEvent, (event) => {
      const worldCoords = this.transformHandler.screenToWorldCoordinates(
        event.x,
        event.y,
      );
      if (!this.game.isValidCoord(worldCoords.x, worldCoords.y)) {
        return;
      }
      if (this.game.myPlayer() === null) {
        return;
      }
      this.clickedTile = this.game.ref(worldCoords.x, worldCoords.y);
      this.game
        .myPlayer()!
        .actions(this.clickedTile)
        .then((actions) => {
          this.updatePlayerActions(
            this.game.myPlayer()!,
            actions,
            this.clickedTile!,
            event.x,
            event.y,
          );
        });
    });

    this.eventBus.on(ContextMenuKeyEvent, (event) => {
      this.handleContextMenuKey(event.action);
    });
  }

  private async updatePlayerActions(
    myPlayer: PlayerView,
    actions: PlayerActions,
    tile: TileRef,
    screenX: number | null = null,
    screenY: number | null = null,
  ) {
    this.buildMenu.playerActions = actions;

    const tileOwner = this.game.owner(tile);
    const recipient = tileOwner.isPlayer() ? (tileOwner as PlayerView) : null;

    if (myPlayer && recipient) {
      this.chatIntegration.setupChatModal(myPlayer, recipient);
    }

    const params: MenuElementParams = {
      myPlayer,
      selected: recipient,
      tile,
      playerActions: actions,
      game: this.game,
      buildMenu: this.buildMenu,
      emojiTable: this.emojiTable,
      playerActionHandler: this.playerActionHandler,
      playerPanel: this.playerPanel,
      chatIntegration: this.chatIntegration,
      closeMenu: () => this.closeMenu(),
      eventBus: this.eventBus,
    };

    this.radialMenu.setParams(params);
    if (screenX !== null && screenY !== null) {
      this.radialMenu.showRadialMenu(screenX, screenY);
      if (this.inputHandler) {
        this.inputHandler.setContextMenuOpen(true);
      }
    } else {
      this.radialMenu.refresh();
    }
  }

  async tick() {
    if (!this.radialMenu.isMenuVisible() || this.clickedTile === null) return;
    if (this.game.ticks() % 5 === 0) {
      this.game
        .myPlayer()!
        .actions(this.clickedTile)
        .then((actions) => {
          this.updatePlayerActions(
            this.game.myPlayer()!,
            actions,
            this.clickedTile!,
          );
        });
    }
  }

  renderLayer(context: CanvasRenderingContext2D) {
    this.radialMenu.renderLayer(context);
  }

  shouldTransform(): boolean {
    return this.radialMenu.shouldTransform();
  }

  closeMenu() {
    if (this.radialMenu.isMenuVisible()) {
      this.radialMenu.hideRadialMenu();
      if (this.inputHandler) {
        this.inputHandler.setContextMenuOpen(false);
      }
    }

    if (this.buildMenu.isVisible) {
      this.buildMenu.hideMenu();
    }

    if (this.emojiTable.isVisible) {
      this.emojiTable.hideTable();
    }

    if (this.playerPanel.isVisible) {
      this.playerPanel.hide();
    }
  }

  private handleContextMenuKey(action: string) {
    if (!this.radialMenu.isMenuVisible()) {
      return;
    }

    const params = this.radialMenu.getParams();
    if (!params) {
      return;
    }

    this.executeContextMenuAction(action, params);
  }

  private executeContextMenuAction(action: string, params: MenuElementParams) {
    switch (action) {
      // Submenu navigation
      case "buildMenu":
        this.triggerSubmenu("build", params);
        break;
      case "attackMenu":
        this.triggerSubmenu("attack", params);
        break;

      // Direct build actions
      case "buildCity":
        this.triggerBuildAction(UnitType.City, params);
        this.closeMenu();
        break;
      case "buildFactory":
        this.triggerBuildAction(UnitType.Factory, params);
        this.closeMenu();
        break;
      case "buildDocks":
        this.triggerBuildAction(UnitType.Port, params);
        this.closeMenu();
        break;
      case "buildDefense":
        this.triggerBuildAction(UnitType.DefensePost, params);
        this.closeMenu();
        break;
      case "buildMissile":
        this.triggerBuildAction(UnitType.MissileSilo, params);
        this.closeMenu();
        break;
      case "buildSam":
        this.triggerBuildAction(UnitType.SAMLauncher, params);
        this.closeMenu();
        break;

      // Direct attack actions
      case "attackAtom":
        this.triggerBuildAction(UnitType.AtomBomb, params);
        this.closeMenu();
        break;
      case "attackMirv":
        this.triggerBuildAction(UnitType.MIRV, params);
        this.closeMenu();
        break;
      case "attackHydrogen":
        this.triggerBuildAction(UnitType.HydrogenBomb, params);
        this.closeMenu();
        break;
      case "attackWarship":
        this.triggerBuildAction(UnitType.Warship, params);
        this.closeMenu();
        break;

      // Other actions
      case "boat":
        this.triggerBoatAction(params);
        this.closeMenu();
        break;
      case "info":
        this.triggerInfoAction(params);
        this.closeMenu();
        break;
      case "deleteUnit":
        this.triggerDeleteAction(params);
        this.closeMenu();
        break;
    }
  }

  private triggerBuildAction(unitType: any, params: MenuElementParams) {
    const buildableUnit = params.playerActions.buildableUnits.find(
      (bu) => bu.type === unitType,
    );
    if (buildableUnit) {
      params.buildMenu.sendBuildOrUpgrade(buildableUnit, params.tile);
    }
  }

  private triggerSubmenu(menuType: string, _params: MenuElementParams) {
    const menuId = menuType === "build" ? "build" : "attack";
    this.radialMenu.navigateToMenuById(menuId);
  }

  private triggerBoatAction(params: MenuElementParams) {
    if (
      params.playerActions.buildableUnits.some(
        (unit) => unit.type === UnitType.TransportShip && unit.canBuild,
      )
    ) {
      // Trigger boat action
      if (boatMenuElement.action && !boatMenuElement.disabled(params)) {
        boatMenuElement.action(params);
      }
    }
  }

  private triggerInfoAction(params: MenuElementParams) {
    if (infoMenuElement.action && !infoMenuElement.disabled(params)) {
      infoMenuElement.action(params);
    }
  }

  private triggerDeleteAction(params: MenuElementParams) {
    if (deleteUnitElement.action && !deleteUnitElement.disabled(params)) {
      deleteUnitElement.action(params);
    }
  }
}
