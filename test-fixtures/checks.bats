#!/usr/bin/env bats

setup() {
  export FIXTURE_ROOT=./test-fixtures
}

@test "script viewer parser fixture" {
  run bash -n "$FIXTURE_ROOT/deploy.sh"
  [ "$status" -eq 0 ]
}
