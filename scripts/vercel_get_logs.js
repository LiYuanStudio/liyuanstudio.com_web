(() => {
  const projectId = 'prj_GWA2MHwmjPLxbQw3vqqWthutWY7Z';
  const teamId = 'team_I2l4qs9iDsMVQTTvVZ3kNg5n';
  return fetch('https://vercel.com/api/v6/deployments?projectId=' + projectId + '&teamId=' + teamId + '&limit=1', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      const d = data.deployments[0];
      return fetch('https://vercel.com/api/v3/deployments/' + d.uid + '/events?projectId=' + projectId + '&teamId=' + teamId + '&limit=400', { credentials: 'include' });
    })
    .then(r => r.text())
    .catch(e => JSON.stringify({ error: e.message }));
})();
