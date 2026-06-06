# Bug Smash: Multiplayer Game Modes

## Overview

Bug Smash is a competitive bug-hunting game where players control stickman developers armed with laptops to smash software bugs. The game features two multiplayer-oriented modes: **Personal Mode** and **Team Mode**.

---

# Player Identity

## Player Name

Players must create a display name before playing.

### Requirements

* Players can set their own display name.
* Players can edit their display name at any time.
* The display name is stored in browser cookies/local storage.
* The stored name is automatically loaded when the player returns.

---

# Core Gameplay Rules

## Health System

Health represents the player's laptop condition and combat capability.

### Health Recovery

Health does NOT regenerate automatically.

Players can only recover health through:

* Collecting Health Icons that appear randomly on the map.
* Standing inside a small Recovery Zone.

### Recovery Restrictions

When a player is defeated and enters **Fixing Laptop Status**:

* Health pickups have no effect.
* Recovery zones have no effect.
* The player must wait for the respawn countdown to finish.
* The player cannot deal damage.
* The player cannot interact with bugs.
* The player cannot attack other players.

### Movement During Defeated State

A defeated player:

* Can freely move around the map.
* Can observe the ongoing battle.
* Cannot deal damage.
* Cannot collect bugs.
* Cannot affect the match outcome until recovered.

---

# Personal Mode

## Description

Personal Mode is an always-available online competitive mode designed for quick individual play.

This mode differs from Offline Mode because players compete against other online players and participate in a global leaderboard.

## Features

### Single Permanent Map

* Only one map exists.
* The map is always available.
* No match creation is required.

### Online Competition

* Players continuously join and leave.
* Players compete for bug kills and leaderboard positions.

### Leaderboard

Tracks:

* Total Bugs Smashed
* Total Player Eliminations
* Personal Score
* Ranking Position

### Respawn

When defeated:

* Respawn time is short.
* Typically only a few seconds.

### Bug Drop Mechanic

When a player is defeated:

* Multiple bugs are released from the defeated player.
* Nearby players may compete to smash the newly spawned bugs.

This mechanic keeps the battlefield active and creates opportunities for comeback plays.

---

# Team Mode

## Description

Team Mode is a session-based multiplayer mode inspired by MOBA-style matchmaking and team competition.

Players join a room, select a team, and compete through multiple stages to determine the winning team and the MVP player.

---

# Room System

## Creating a Room

Any player may:

* Create a room.
* Become the Room Host.

## Joining a Room

Players can:

* Join an existing room.
* Select an existing team.
* Create a new team if allowed.

## Match Start

Only the Room Host can:

* Start the match.
* Control when the game begins.

---

# Team Rules

## Friendly Fire

Friendly fire is disabled.

Players cannot damage teammates.

## Enemy Combat

Players can damage:

* Enemy players.
* Bugs.

## Objectives

Teams compete to:

* Smash bugs.
* Prevent enemy teams from scoring bugs.

The team with the highest bug score wins the match.

---

# Match Structure

## Multi-Stage Progression

Each match contains multiple stages.

Recommended:

* 5 stages per match.

## Stage Completion

Each stage contains:

* A predefined number of bugs.

When all bugs are eliminated:

* The next stage begins automatically.

## Match Completion

When all stages are completed:

* The match ends.
* Final rankings are calculated.

---

# Scoring

## Team Score

Teams earn points by smashing bugs.

### Winning Team

The team with the highest total bug count wins.

## MVP Selection

At the end of the match, one player is selected as MVP.

Possible MVP criteria:

* Bugs smashed
* Damage dealt
* Enemy eliminations
* Objective contribution

---

# Defeat and Respawn System

## Player Elimination

Players can be defeated by enemy players.

## No Bug Spawn

Unlike Personal Mode:

When a player is defeated in Team Mode:

* No bugs are spawned.

## Increasing Respawn Timer

Respawn duration increases as the stage progresses.

Example:

Stage 1:

* 3-second respawn

Stage 2:

* 5-second respawn

Stage 3:

* 8-second respawn

Stage 4:

* 12-second respawn

Stage 5:

* 15-second respawn

This increases strategic importance during late-game fights.

---

# Strategic Gameplay

## Bug Competition

Players from all teams compete to secure bug kills.

Important aspects:

* Last-hit competition.
* Area control.
* Bug route prediction.
* Team coordination.

## Combat Purpose

Player-versus-player combat serves to:

* Delay opponents.
* Control bug-rich areas.
* Protect teammates.
* Secure bug objectives.

The primary objective remains bug collection and bug smashing.

---

# Victory Conditions

## Team Victory

The winning team is the team with the highest bug score when the final stage ends.

## Individual Recognition

Awards may include:

* MVP
* Most Bugs Smashed
* Most Eliminations
* Most Damage Dealt
* Best Defender
* Bug Hunter

---

# Summary

## Personal Mode

* Persistent online world.
* Single permanent map.
* Global leaderboard.
* Fast respawn.
* Defeated players release bugs.

## Team Mode

* Room-based matchmaking.
* Team selection.
* Multiple stages.
* Increasing respawn timers.
* No bug spawn on player defeat.
* Team with most bugs smashed wins.
* MVP selected at match end.
