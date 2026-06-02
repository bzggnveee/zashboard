<template>
  <div class="setting-item flex-col items-start gap-2 py-3">
    <div class="settings-section-label w-full">{{ $t('ruleInjectionSettings') }}</div>
    <p class="text-base-content/60 w-full text-xs leading-relaxed">
      {{ $t('ruleInjectionSettingsHint') }}
    </p>
    <label class="flex w-full flex-col gap-1">
      <span class="text-sm">{{ $t('ruleInjectionConfigPath') }}</span>
      <input
        v-model="ruleInjectionConfigPath"
        class="input input-bordered input-sm w-full font-mono text-xs"
        type="text"
        :placeholder="$t('ruleInjectionConfigPathPlaceholder')"
      />
    </label>
    <label class="label w-full cursor-pointer justify-start gap-2">
      <input
        v-model="ruleInjectionPersistToDisk"
        class="toggle toggle-sm"
        type="checkbox"
      />
      <span class="text-sm">{{ $t('ruleInjectionPersistToDisk') }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { ruleInjectionConfigPath, ruleInjectionPersistToDisk } from '@/helper/ruleInjectionSettings'
</script>
