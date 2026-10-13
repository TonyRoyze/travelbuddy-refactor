# Deploy TravelBuddy to k3s

The manifests run the app and a single PostgreSQL 16 instance. PostgreSQL data
uses the k3s `local-path` StorageClass. That volume is local to one node, so keep
off-cluster backups and test restores before relying on this for important data.

## One-time cluster setup

Create strong credentials locally. Use a URL-safe password (the example below
uses hex) so it can be included in a PostgreSQL connection URL without escaping:

```sh
DB_PASSWORD="$(openssl rand -hex 32)"
AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
kubectl apply -f k8s/base.yaml

kubectl -n travelbuddy create secret generic postgres-secrets \
  --from-literal=POSTGRES_DB=travelbuddy \
  --from-literal=POSTGRES_USER=travelbuddy_app \
  --from-literal=POSTGRES_PASSWORD="$DB_PASSWORD"

kubectl -n travelbuddy create secret generic travelbuddy-secrets \
  --from-literal=DOCUMENT_DATABASE_URL="postgresql://travelbuddy_app:${DB_PASSWORD}@postgres.travelbuddy.svc.cluster.local:5432/travelbuddy?schema=travelbuddy_backend" \
  --from-literal=GOOGLE_CLIENT_ID='YOUR_GOOGLE_WEB_CLIENT_ID' \
  --from-literal=AUTH_APP_URL='https://travelbuddy.shalinda.com' \
  --from-literal=AUTH_SECRET="$AUTH_SECRET"
```

Save `DB_PASSWORD` and `AUTH_SECRET` in your password manager before closing
that shell. The cluster Secrets are not committed to Git.

The app image is pushed to GHCR. Create a GitHub Personal Access Token with
`read:packages`, then create the image pull Secret (or make the GHCR package
public and remove `imagePullSecrets` from the app and migration manifests):

```sh
kubectl -n travelbuddy create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_PAT
```

The Ingress expects TLS Secret `travelbuddy-tls`. Use your existing certificate
automation or create the Secret from a certificate and private key:

```sh
kubectl -n travelbuddy create secret tls travelbuddy-tls \
  --cert=fullchain.pem --key=privkey.pem
```

Set the Google OAuth authorized JavaScript origin to
`https://travelbuddy.shalinda.com`.

## GitHub Actions setup

The workflow in `.github/workflows/deploy.yml` runs on pushes to `main` and
manual dispatch. Add repository secret `KUBE_CONFIG_B64` containing the
base64-encoded kubeconfig for a cluster reachable by the GitHub runner. For a
private network, use a self-hosted GitHub runner that can reach the k3s API.
The workflow applies PostgreSQL, waits for it, applies migrations once for the
image, and then deploys the app.

GHCR stores the built container image; the Kubernetes YAML remains in Git. Push
the Dockerfile, workflow, and `k8s/` files to `main`, then fetch them on the
server over SSH:

```sh
git clone git@github.com:shalinda/travelbuddy.git ~/travelbuddy
cd ~/travelbuddy
```

For later updates, run `git pull --ff-only` in `~/travelbuddy`. If the GitHub
runner has cluster access configured, each successful workflow run deploys
automatically. Kubernetes pulls the tagged GHCR image from the Deployment; you
do not need to run `docker pull` on the server.

If the image build succeeds but the workflow cannot reach the cluster, deploy
the image manually from the SSH session. Replace `COMMIT_SHA` with the full SHA
shown in the GitHub Actions run:

```sh
sudo apt-get update && sudo apt-get install -y gettext-base
cd ~/travelbuddy

export IMAGE='ghcr.io/shalinda/travelbuddy:COMMIT_SHA'
export JOB_NAME="travelbuddy-migrate-manual-$(date +%s)"

k apply -f k8s/base.yaml
k apply -f k8s/postgres.yaml
k rollout status statefulset/postgres -n travelbuddy --timeout=10m

envsubst '${IMAGE} ${JOB_NAME}' < k8s/migration-job.yaml | k apply -f -
k wait --for=condition=complete "job/$JOB_NAME" \
  -n travelbuddy --timeout=10m
envsubst '${IMAGE}' < k8s/app.yaml | k apply -f -
k rollout status deployment/travelbuddy -n travelbuddy --timeout=5m
```

## Replacing the existing Reciptile app

The Reciptile manifest you shared creates `reciptile-frontend` and
`reciptile-api` Deployments, `reciptile-frontend` and `backend` Services, and a
`reciptile` Ingress in the `reciptile` namespace. After TravelBuddy is healthy
at `https://travelbuddy.shalinda.com`, remove those old app resources:

```sh
kubectl delete ingress reciptile -n reciptile --ignore-not-found
kubectl delete service reciptile-frontend backend -n reciptile --ignore-not-found
kubectl delete deployment reciptile-frontend reciptile-api -n reciptile --ignore-not-found
```

This removes the old app pods and routing while leaving the namespace and
`reciptile-api-env` Secret available in case you need to roll back. The
Reciptile manifest you provided defines no database or PVC, so it contains no
database volume to remove. Keep the old workloads until TravelBuddy has passed
your sign-in and database checks.

## DNS and TLS

`travelbuddy.shalinda.com` currently resolves to Cloudflare addresses, but this
does not confirm that traffic reaches the k3s ingress. Point its DNS record to
the public IP that receives your k3s Traefik traffic. Ensure ports 80 and 443
reach the cluster ingress, and provision `travelbuddy-tls` for the hostname.
If Cloudflare proxying is enabled, configure TLS mode and origin certificates
for your chosen ingress/TLS setup.

Check rollout with:

```sh
kubectl get pods,pvc,svc,ingress -n travelbuddy
kubectl rollout status deployment/travelbuddy -n travelbuddy
```
