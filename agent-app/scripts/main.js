import controller from './notifications-controller.js';
import config from './config.js';
import {PexRtcWrapper} from './pexrtc-wrapper.js';
// Obtain a reference to the platformClient object
const platformClient = require('platformClient');
const client = platformClient.ApiClient.instance;
// API instances
const usersApi = new platformClient.UsersApi();
const conversationsApi = new platformClient.ConversationsApi();
// Client App
let ClientApp = window.purecloud.apps.ClientApp;
let clientApp = new ClientApp({
    pcEnvironment: config.genesys.region
});
let conversationId = '';
let agent = null;
const urlParams = new URLSearchParams(window.location.search);
conversationId = urlParams.get('conversationid');
const redirectUri = config.environment === 'development' ? 
                      config.developmentUri : config.prodUri;
client.setEnvironment(config.genesys.region);
client.loginImplicitGrant(
    config.genesys.oauthClientID,
    redirectUri,
    { state: conversationId }
)
.then(data => {
    conversationId = data.state;
    return usersApi.getUsersMe();
}).then(currentUser => {
    agent = currentUser;
    return conversationsApi.getConversation(conversationId);
}).then((conversation) => {
    // ADD HERE: Function to show the RBFCU Agent Widget
    function showRBFCUAgentWidget() {
        // Try to click the RBFCU Agent Widget button first
        const widgetButton = document.querySelector('button[aria-label="RBFCU Agent Widget"]');
        if (widgetButton) {
            console.log("Found the RBFCU Agent Widget button, clicking it...");
            widgetButton.click();
            return;
        }
        
        // If button not found, directly modify the panel's visibility
        const hiddenPanel = document.querySelector('.sub-panel-wrapper.hidden.no-width');
        if (hiddenPanel) {
            console.log("Found the hidden panel, making it visible...");
            // Remove the classes that hide the panel
            hiddenPanel.classList.remove('hidden', 'no-width');
            
            // Find the contextual div inside and update its visibility
            const contextualDiv = hiddenPanel.querySelector('[aria-hidden="true"][style*="display: none"]');
            if (contextualDiv) {
                contextualDiv.setAttribute('aria-hidden', 'false');
                contextualDiv.style.display = '';  // Remove the display:none
            }
        }
    }
    
    // Give the UI a moment to fully load before attempting to show the widget
    setTimeout(showRBFCUAgentWidget, 1000);
    
    // Continue with the existing code
    let videoElement = document.getElementById(config.videoElementId);
    let confNode = config.pexip.conferenceNode;
    let displayName = `Agent: ${agent.name}`;
    let pin = config.pexip.conferencePin;
    let confAlias = conversation.participants?.filter((p) => p.purpose == "customer")[0]?.aniName;
    console.assert(confAlias, "Unable to determine the conference alias.");
    let prefixedConfAlias = `${config.pexip.conferencePrefix}${confAlias}`;
    let pexrtcWrapper = new PexRtcWrapper(videoElement, confNode, prefixedConfAlias, displayName, pin);
    pexrtcWrapper.makeCall().muteAudio();
    controller.createChannel()
    .then(_ => {
      return controller.addSubscription(
        `v2.users.${agent.id}.conversations.calls`,
        (callEvent) => {
          let agentParticipant = callEvent?.eventBody?.participants?.filter((p) => p.purpose == "agent")[0];
          if (agentParticipant?.state === "disconnected") {
            console.log("Agent has ended the call. Disconnecting all conference participants");
            pexrtcWrapper.disconnectAll();
          }
        });
    });
    clientApp.lifecycle.addStopListener(() => {
      console.log("Application is closing. Cleaning up resources.");
      pexrtcWrapper.disconnectAll();
    }, true);
    return pexrtcWrapper;
}).then(data => {
    console.log('Finished Setup');
}).catch(e => console.log(e));
