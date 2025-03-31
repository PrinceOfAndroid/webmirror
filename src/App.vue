<script>
import ScreenMirror from "@/views/ScreenMirror.vue";

export default {
  name: 'App',
  components: {
    ScreenMirror
  }
}
</script>

<template>
  <div id="app">
    <ScreenMirror />
  </div>
</template>

<style>
#app {
  font-family: Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 0;
}

body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
