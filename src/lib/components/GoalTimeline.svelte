<script>
  /**
   * GoalTimeline — Barre de timing des buts H2H (style FootyStats)
   * ⚽ coloré = marqué, ⚽ grisé = encaissé
   */
  let { h2hTimeline = [] } = $props();
</script>

<div class="h2h-timeline">
  {#each h2hTimeline as item}
    <div class="h2h-item">
      <span class="h2h-item__date">{item.date}</span>
      <span class="h2h-item__score">{item.htScore}</span>
      <span class="h2h-item__result">{item.butMT ? '✅' : '❌'}</span>
      <div class="goal-timeline">
        <div class="goal-timeline__bar">
          <span class="goal-timeline__marker">45'</span>
          <span class="goal-timeline__ft">FT</span>
          {#each (item.goals || []) as goal}
            <span
              class="goal-timeline__ball"
              class:goal-timeline__ball--conceded={!goal.scored}
              style="left:{Math.min((goal.minute / 90) * 100, 98)}%"
              title="{goal.minute}' {goal.scored ? 'Marqué' : 'Encaissé'}"
            >⚽</span>
          {/each}
        </div>
        <span class="goal-timeline__total">{item.total}</span>
      </div>
    </div>
  {/each}

  {#if h2hTimeline.length === 0}
    <p style="font-size:12px;color:var(--color-text-muted);">Aucune donnée H2H disponible</p>
  {/if}
</div>
